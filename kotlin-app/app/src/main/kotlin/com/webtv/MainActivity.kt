package com.webtv

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.widget.TextView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    @Volatile private var bridge: WebTVBridge? = null
    @Volatile private var scriptInjector: ScriptInjector? = null
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var uploadMessage: ValueCallback<Array<Uri>>? = null
    private var listenerGuardInstalled = false
    private var currentPageUrl: String? = null
    private var pendingScriptInjection: Pair<String, String>? = null
    private var preloadedScriptsPayload: String? = null
    private var activeChannelId: String? = null
    private var activeChannelName: String? = null
    private var closedChannelPayload: String? = null
    private var assetLoader: WebViewAssetLoader? = null
    private var pendingMicPermissionRequest: PermissionRequest? = null
    private var ramOverlay: TextView? = null
    private var ramHandler: Handler? = null
    private var ramUpdateRunnable: Runnable? = null
    private val channelScripts = createLruMap<String, MutableList<Triple<String, String, String>>>(50)
    private val urlScripts = createLruMap<String, MutableList<Triple<String, String, String>>>(50)
    private val domainScripts = createLruMap<String, MutableList<Triple<String, String, String>>>(50)
    private var closeNavigationScheduled = false
    private var widgetChannelData: String? = null

    fun storeWidgetData(channelsPayload: String) {
        widgetChannelData = channelsPayload
        WebTVLog.d("Main", "Widget channel data stored")
    }

    private val requestMicPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            WebTVLog.d("Main", "Mic permission granted by system dialog")
            grantPendingMicPermission()
        } else {
            WebTVLog.d("Main", "Mic permission denied by system dialog")
            denyPendingMicPermission()
        }
    }

    companion object {
        private const val FILE_CHOOSER_RESULT_CODE = 1001
        private const val START_URL = "https://hellfiveosborn.github.io/WebTV"
        private const val ASSET_DOMAIN = "appassets.androidplatform.net"
        private const val LRU_CAPACITY = 50

        private fun <K, V> createLruMap(capacity: Int): MutableMap<K, V> {
            return object : LinkedHashMap<K, V>(capacity, 0.75f, true) {
                override fun removeEldestEntry(eldest: MutableMap.MutableEntry<K, V>?): Boolean {
                    return size > capacity
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        webView.alpha = 0f
        setupWebView()
        initRamOverlay()

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(START_URL)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        bridge = WebTVBridge(this)
        scriptInjector = ScriptInjector(webView)

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/scripts/", WebViewAssetLoader.AssetsPathHandler(this))
            .setDomain(ASSET_DOMAIN)
            .build()

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(true)
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            userAgentString = buildUserAgent()
        }

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(bridge!!, "WebTVBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean = false

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader?.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                WebTVLog.d("Main", "onPageFinished: url=$url, currentPageUrl=$currentPageUrl, activeChannel=$activeChannelId")

                if (webView.alpha == 0f) {
                    webView.animate().alpha(1f).setDuration(200).start()
                }

                if (url != null && url != currentPageUrl) {
                    val previousUrl = currentPageUrl
                    currentPageUrl = url

                    listenerGuardInstalled = false
                    WebTVLog.d("Main", "Page changed: $previousUrl -> $url")

                    injectAppBridgeScript()

                    if (activeChannelId != null) {
                        WebTVLog.d("Main", "Channel active ($activeChannelId), injecting into new page")
                        scriptInjector?.clearInjectedScripts()
                        resetScriptFlags()
                        injectControlScript()
                        injectChannelScripts(url)

                        if (preloadedScriptsPayload != null) {
                            injectPreloadedScripts()
                        }
                    }
                }
                injectEventListenerGuard()
            }

            override fun onRenderProcessGone(
                view: WebView?,
                detail: android.webkit.RenderProcessGoneDetail?
            ): Boolean {
                WebTVLog.e("Render", "Renderer killed. Did crash: ${detail?.didCrash() ?: "unknown"}")
                val currentUrl = view?.url ?: currentPageUrl
                recreateWebView(currentUrl)
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message?
            ): Boolean {
                val newWebView = WebView(this@MainActivity)
                newWebView.settings.javaScriptEnabled = true
                newWebView.settings.domStorageEnabled = true
                newWebView.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: WebResourceRequest?
                    ): Boolean {
                        val url = request?.url?.toString() ?: return false
                        WebTVLog.d("Main", "Popup redirecting to main WebView: $url")
                        webView.loadUrl(url)
                        view?.post { view.destroy() }
                        return true
                    }
                }
                val transport = resultMsg?.obj as WebView.WebViewTransport
                transport.webView = newWebView
                resultMsg.sendToTarget()
                return true
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (customView != null) {
                    callback?.onCustomViewHidden()
                    return
                }
                customView = view
                customViewCallback = callback
                val decorView = window.decorView as FrameLayout
                decorView.addView(
                    customView,
                    FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                )
                customView?.visibility = View.VISIBLE
                hideSystemBars()
            }

            override fun onHideCustomView() {
                if (customView == null) return
                val decorView = window.decorView as FrameLayout
                decorView.removeView(customView)
                customView?.visibility = View.GONE
                customView = null
                customViewCallback?.onCustomViewHidden()
                customViewCallback = null
                hideSystemBars()
            }

            override fun onJsAlert(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle("WebTV")
                    .setMessage(message)
                    .setPositiveButton("OK") { _, _ ->
                        result?.confirm()
                    }
                    .setCancelable(false)
                    .show()
                return true
            }

            override fun onJsConfirm(
                view: WebView?,
                url: String?,
                message: String?,
                result: JsResult?
            ): Boolean {
                MaterialAlertDialogBuilder(this@MainActivity)
                    .setTitle("WebTV")
                    .setMessage(message)
                    .setPositiveButton("OK") { _, _ ->
                        result?.confirm()
                    }
                    .setNegativeButton("Cancelar") { _, _ ->
                        result?.cancel()
                    }
                    .setCancelable(false)
                    .show()
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request == null) return
                val resources = request.resources
                if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                    if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(resources)
                        WebTVLog.d("Main", "Mic permission granted to WebView (already have it)")
                    } else {
                        pendingMicPermissionRequest = request
                        requestMicrophonePermission()
                    }
                } else {
                    super.onPermissionRequest(request)
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest?) {
                super.onPermissionRequestCanceled(request)
                if (request == pendingMicPermissionRequest) {
                    pendingMicPermissionRequest = null
                }
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                if (uploadMessage != null) {
                    uploadMessage?.onReceiveValue(null)
                }
                uploadMessage = filePathCallback
                val intent = fileChooserParams?.createIntent()
                if (intent == null) {
                    uploadMessage?.onReceiveValue(null)
                    uploadMessage = null
                    return false
                }
                try {
                    startActivityForResult(intent, FILE_CHOOSER_RESULT_CODE)
                } catch (e: Exception) {
                    uploadMessage = null
                    return false
                }
                return true
            }
        }
    }

    private fun recreateWebView(fallbackUrl: String?) {
        WebTVLog.w("Render", "Recreating WebView after renderer crash")
        val parent = webView.parent as? ViewGroup ?: run {
            WebTVLog.e("Render", "No parent ViewGroup, cannot recreate WebView")
            finishAffinity()
            return
        }

        parent.removeView(webView)
        try { webView.destroy() } catch (_: Exception) {}

        bridge = null
        scriptInjector = null

        webView = WebView(this)
        webView.id = R.id.webview
        webView.alpha = 0f
        parent.addView(webView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))

        setupWebView()
        listenerGuardInstalled = false
        scriptInjector?.injectedScriptIds?.clear()
        channelScripts.clear()
        urlScripts.clear()
        domainScripts.clear()

        val loadUrl = fallbackUrl ?: START_URL
        WebTVLog.d("Render", "Loading $loadUrl after WebView recreation")
        webView.loadUrl(loadUrl)
    }

    fun buildUserAgent(): String {
        return "WebTV/1.0 (Android)"
    }

    private fun requestMicrophonePermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            grantPendingMicPermission()
            return
        }
        requestMicPermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun grantPendingMicPermission() {
        pendingMicPermissionRequest?.grant(pendingMicPermissionRequest!!.resources)
        WebTVLog.d("Main", "Mic permission granted to WebView after user prompt")
        pendingMicPermissionRequest = null
    }

    private fun denyPendingMicPermission() {
        pendingMicPermissionRequest?.deny()
        WebTVLog.d("Main", "Mic permission denied for WebView")
        pendingMicPermissionRequest = null
    }

    private fun hideSystemBars() {
        WindowInsetsControllerCompat(window, window.decorView).hide(WindowInsetsCompat.Type.systemBars())
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: android.content.Intent?) {
        if (requestCode == FILE_CHOOSER_RESULT_CODE) {
            if (uploadMessage != null) {
                val result = if (resultCode == RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
                uploadMessage?.onReceiveValue(result)
                uploadMessage = null
            }
        } else {
            super.onActivityResult(requestCode, resultCode, data)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        webView.resumeTimers()
        hideSystemBars()
        startRamMonitor()
    }

    override fun onPause() {
        super.onPause()
        stopRamMonitor()
        webView.pauseTimers()
        webView.onPause()
    }

    override fun onDestroy() {
        stopRamMonitor()
        try {
            webView.stopLoading()
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.removeAllViews()
            webView.loadUrl("about:blank")
            webView.clearHistory()
            webView.clearCache(true)
            webView.destroy()
        } catch (_: Exception) {}

        bridge = null
        scriptInjector = null
        customView = null
        customViewCallback = null
        uploadMessage = null
        currentPageUrl = null
        pendingScriptInjection = null
        preloadedScriptsPayload = null
        activeChannelId = null
        activeChannelName = null
        closedChannelPayload = null
        assetLoader = null
        pendingMicPermissionRequest = null
        channelScripts.clear()
        urlScripts.clear()
        domainScripts.clear()
        scriptInjector?.injectedScriptIds?.clear()

        super.onDestroy()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        when (level) {
            android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW -> {
                WebTVLog.d("Main", "onTrimMemory: RUNNING_LOW – clearing WebView cache")
                webView.clearCache(true)
            }
            android.content.ComponentCallbacks2.TRIM_MEMORY_MODERATE,
            android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL -> {
                WebTVLog.d("Main", "onTrimMemory: MODERATE/CRITICAL – full cache flush")
                webView.clearCache(true)
                CookieManager.getInstance().flush()
                channelScripts.clear()
                urlScripts.clear()
                domainScripts.clear()
            }
            android.content.ComponentCallbacks2.TRIM_MEMORY_COMPLETE,
            android.content.ComponentCallbacks2.TRIM_MEMORY_BACKGROUND -> {
                WebTVLog.d("Main", "onTrimMemory: COMPLETE/BACKGROUND – aggressive cleanup")
                webView.clearCache(true)
                CookieManager.getInstance().flush()
                channelScripts.clear()
                urlScripts.clear()
                domainScripts.clear()
                scriptInjector?.injectedScriptIds?.clear()
                assetLoader = null
                preloadedScriptsPayload = null
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (activeChannelId != null) {
            val closingChannelId = activeChannelId ?: "unknown"
            val closingChannelName = activeChannelName ?: "Unknown"
            val isOnGrid = currentPageUrl != null && currentPageUrl!!.startsWith(START_URL)

            WebTVLog.d("WebTV", "BACK: active channel=$closingChannelId, onGrid=$isOnGrid, url=$currentPageUrl")

            val script = """
                javascript:(function() {
                    if (window.WebTVBridge && window.WebTVBridge.onPlayerClosed) {
                        var payload = JSON.stringify({
                            channelId: '$closingChannelId',
                            channelName: '${closingChannelName.replace("'", "\\'")}',
                            timestamp: Date.now()
                        });
                        window.WebTVBridge.onPlayerClosed(payload);
                    } else if (window.WebTV && window.WebTV.channel && window.WebTV.channel.close) {
                        window.WebTV.channel.close();
                    } else if (window.WebTVBridge && window.WebTVBridge.onChannelClosed) {
                        var payload = JSON.stringify({
                            channelId: '$closingChannelId',
                            channelName: '${closingChannelName.replace("'", "\\'")}',
                            timestamp: Date.now()
                        });
                        window.WebTVBridge.onChannelClosed(payload);
                    }
                })();
            """.trimIndent()
            webView.evaluateJavascript(script, null)
            activeChannelId = null
            activeChannelName = null
            scriptInjector?.injectedScriptIds?.clear()

            if (!isOnGrid) {
                playCloseAndNavigateWith(closingChannelId, closingChannelName)
            }
            return
        }

        val onGrid = currentPageUrl != null && currentPageUrl!!.startsWith(START_URL) &&
            !currentPageUrl!!.contains("/channel/")

        if (!onGrid) {
            WebTVLog.d("WebTV", "BACK: not on grid (url=$currentPageUrl), returning to $START_URL")
            playCloseAndNavigate()
        } else {
            showExitDialog()
        }
    }

    private fun showExitDialog() {
        android.app.AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Sair do WebTV")
            .setMessage("Deseja realmente fechar o aplicativo?")
            .setPositiveButton("Sair") { _, _ ->
                finishAffinity()
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    private fun injectEventListenerGuard() {
        WebTVLog.d("Main", "injectEventListenerGuard: installed=$listenerGuardInstalled, url=$currentPageUrl")
        if (listenerGuardInstalled) {
            WebTVLog.d("Main", "Guard já instalado para página atual")
            return
        }

        val guardScript = """
            (function() {
                if (window.__webtvListenersActive) return;
                window.__webtvChannelCache = {};

                function tryInstall() {
                    if (typeof window.WebTV === 'undefined' ||
                        typeof window.WebTV.events === 'undefined' ||
                        !window.__webtvAppBridgeInjected) {
                        setTimeout(tryInstall, 100);
                        return;
                    }

window.WebTV.events.on('app:loaded', (event) => {
                        WebTVBridge.onAppLoaded(JSON.stringify(event));
                    });

                    window.WebTV.events.on('channel:clicked', (event) => {
                        const channelId = event.id;
                        const now = Date.now();
                        const cached = window.__webtvChannelCache[channelId];

                        if (cached && (now - cached) < 500) {
                            console.log('Ignored duplicate channel:clicked for ' + channelId);
                            return;
                        }

                        window.__webtvChannelCache[channelId] = now;
                        console.log('Dispatching channel:clicked for ' + channelId);
                        WebTVBridge.onChannelClicked(JSON.stringify(event));
                    });

                    window.WebTV.events.on('player:opened', (event) => {
                        WebTVBridge.onPlayerOpened(JSON.stringify(event));
                    });

                    window.WebTV.events.on('player:closed', (event) => {
                        WebTVBridge.onPlayerClosed(JSON.stringify(event));
                    });

                    window.WebTV.events.on('script:retrieved', (event) => {
                        WebTVBridge.onScriptRetrieved(JSON.stringify(event));
                    });

                    window.WebTV.events.on('search:changed', (event) => {
                        WebTVBridge.onSearchChanged(JSON.stringify(event));
                    });

                    window.WebTV.events.on('category:changed', (event) => {
                        WebTVBridge.onCategoryChanged(JSON.stringify(event));
                    });

                    window.WebTV.events.on('navigated:home', (event) => {
                        WebTVBridge.onNavigatedHome(JSON.stringify(event));
                    });

window.WebTV.events.on('scripts:preloaded', (event) => {
                        WebTVBridge.onScriptsPreloaded(JSON.stringify(event));
                    });

                    window.WebTV.events.on('scripts:loaded', (event) => {
                        WebTVBridge.onScriptsLoaded(JSON.stringify(event));
                    });

                    window.__webtvListenersActive = true;
                    WebTVBridge.onListenersReady();
                    console.log('[WebTV] Listeners installed successfully');
                }

                tryInstall();
            })();
        """.trimIndent()

        webView.evaluateJavascript(guardScript) { value ->
            WebTVLog.d("Main", "Guard script injected: $value")
            listenerGuardInstalled = true
        }
    }

    fun injectScriptsForChannel(channelId: String, url: String) {
        WebTVLog.d("Main", "Player opened for channel $channelId, URL: $url")
        if (preloadedScriptsPayload != null) {
            injectPreloadedScripts()
        } else {
            WebTVLog.d("Main", "No preloaded scripts available for channel: $channelId")
        }
    }

    fun cachePreloadedScriptsForUrl(url: String, payload: String) {
        preloadedScriptsPayload = payload
        WebTVLog.d("Main", "Preloaded scripts cached for pending injection: $url")
    }

    private fun injectControlScript() {
        if (activeChannelId == null) {
            WebTVLog.d("Main", "No active channel to inject control script")
            return
        }

        val script = """
            (function() {
                window.__webtvActiveChannelId = '$activeChannelId';
                window.__webtvActiveChannelName = '$activeChannelName';
                window.__webtvBaseUrl = '$START_URL';
                console.log('[WebTV] Active channel set:', window.__webtvActiveChannelId, window.__webtvActiveChannelName);
            })()
        """.trimIndent()

        WebTVLog.d("Main", "Injecting control script for channel: $activeChannelId")
        scriptInjector?.injectScriptRaw(script, "ControlScript") { success ->
            if (success) {
                WebTVLog.d("Main", "Control script injected successfully")
                injectWidgetData()
                injectWidgetBundle()
            } else {
                WebTVLog.e("Main", "Failed to inject control script")
            }
        }
    }

    private fun injectWidgetBundle() {
        if (activeChannelId == null) return
        try {
            val code = assets.open("scripts/webtv-widget.js").bufferedReader().use { it.readText() }
            webView.evaluateJavascript(code, null)
            WebTVLog.d("Main", "Widget bundle injected")
        } catch (e: Exception) {
            WebTVLog.e("Main", "Failed to load widget bundle: ${e.message}")
        }
    }

    private fun injectWidgetData() {
        if (widgetChannelData == null) return
        try {
            val json = JSONObject(widgetChannelData!!)
            val channelsJson = json.getJSONArray("channels").toString()
            webView.evaluateJavascript(
                "window.__webtvWidgetData = {activeChannelId:'$activeChannelId',activeChannelName:'${activeChannelName?.replace("'", "\\'")}',channels:$channelsJson};",
                null
            )
            WebTVLog.d("Main", "Widget data injected")
        } catch (e: Exception) {
            WebTVLog.e("Main", "Failed to inject widget data: ${e.message}")
        }
    }

    private fun injectPreloadedScripts() {
        if (preloadedScriptsPayload == null) {
            WebTVLog.d("Main", "No preloaded scripts to inject")
            return
        }

        WebTVLog.d("Main", "Injecting preloaded scripts")
        scriptInjector?.injectPreloadedScripts(preloadedScriptsPayload!!) { count ->
            WebTVLog.d("Main", "Injected $count preloaded scripts")
            runOnUiThread {
                Toast.makeText(this, "Scripts injetados com sucesso", Toast.LENGTH_SHORT).show()
            }
        }
    }

    fun handleNavigatedHome() {
        val pendingClose = closedChannelPayload
        closedChannelPayload = null

        pendingScriptInjection = null
        activeChannelId = null
        activeChannelName = null
        listenerGuardInstalled = false
        scriptInjector?.clearInjectedScripts()
        preloadedScriptsPayload = null
        scriptInjector?.injectedScriptIds?.clear()
        closeNavigationScheduled = false
        WebTVLog.d("Main", "Navigated to home, reset injection state")

        if (pendingClose != null) {
            webView.post { injectChannelCloseEvent(pendingClose) }
        }
    }

    fun clearInjectedScriptsCache() {
        scriptInjector?.clearInjectedScripts()
        preloadedScriptsPayload = null
        WebTVLog.d("Main", "Script injection cache cleared")
    }

    fun setCurrentChannel(channelId: String, channelName: String) {
        activeChannelId = channelId
        activeChannelName = channelName
    }

    fun handlePlayerClosed(channelId: String, channelName: String) {
        WebTVLog.d("WebTV", "Player closed via frontend: $channelName (ID: $channelId)")

        val payload = """
            {
                "channelId": "$channelId",
                "channelName": "$channelName",
                "timestamp": ${System.currentTimeMillis()}
            }
        """.trimIndent()

        closedChannelPayload = payload

        activeChannelId = null
        activeChannelName = null

        playCloseAndNavigate()
    }

    fun handleChannelClosed(channelId: String, channelName: String) {
        WebTVLog.d("WebTV", "Canal fechado: $channelName (ID: $channelId)")

        val payload = """
            {
                "channelId": "$channelId",
                "channelName": "$channelName",
                "timestamp": ${System.currentTimeMillis()}
            }
        """.trimIndent()

        closedChannelPayload = payload

        activeChannelId = null
        activeChannelName = null

        playCloseAndNavigate()
    }

    private fun playCloseAndNavigate() {
        playCloseAndNavigateWith(null, null)
    }

    private fun playCloseAndNavigateWith(channelId: String?, channelName: String?) {
        if (closeNavigationScheduled) {
            WebTVLog.d("Main", "Close navigation already scheduled, ignoring duplicate")
            return
        }
        closeNavigationScheduled = true
        val idJson = if (channelId != null) "'${channelId.replace("'", "\\'")}'" else "null"
        val nameJson = if (channelName != null) "'${channelName.replace("'", "\\'")}'" else "null"
        val script = """
            (function(){
                if(window.WebTV&&window.WebTV.events&&typeof window.WebTV.events.emit==='function'){
                    window.WebTV.events.emit('channel:closing',{});
                    window.WebTV.events.emit('player:closed', {
                        channelId: $idJson,
                        channelName: $nameJson,
                        timestamp: Date.now()
                    });
                    console.log('[WebTV] channel:closing + player:closed emitted');
                } else {
                    console.log('[WebTV] WebTV not ready, cannot emit close events');
                }
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
        webView.postDelayed({
            webView.loadUrl(START_URL)
        }, 300)
    }

    private fun resetScriptFlags() {
        val resetScript = """
            (function() {
                window.__webtvScriptAlreadyInjected = false;
                window.__webtvAppBridgeInjected = false;
                window.WebTV = window.WebTV || {};
                window.WebTV.injectedScripts = {};
                console.log('[WebTV] Script flags reset');
            })()
        """.trimIndent()

        webView.evaluateJavascript(resetScript, null)
        WebTVLog.d("WebTV", "Script flags reset before injection")
    }

    private fun injectAppBridgeScript() {
        try {
            val code = assets.open("scripts/appBridge.js").bufferedReader().use { it.readText() }
            webView.evaluateJavascript(code, null)
            WebTVLog.d("WebTV", "AppBridge script injected inline")
        } catch (e: Exception) {
            WebTVLog.e("WebTV", "Failed to load AppBridge script: ${e.message}")
        }
    }

    private fun injectChannelCloseEvent(payload: String) {
        val closeScript = """
            (function() {
                function tryDispatch() {
                    if (typeof window.WebTV === 'undefined' || typeof window.WebTV.events === 'undefined') {
                        setTimeout(tryDispatch, 100);
                        return;
                    }
                    window.WebTV.events.emit('channel:close', $payload);
                    console.log('[WebTV] Emi channel:close on grid:', $payload);
                }
                tryDispatch();
            })();
        """.trimIndent()

        webView.evaluateJavascript(closeScript, null)
        WebTVLog.d("WebTV", "channel:close event injected into grid")
    }

    fun setPendingScriptInjection(channelId: String, channelName: String) {
        pendingScriptInjection = Pair(channelId, channelName)
        WebTVLog.d("Main", "Pending script injection set for: $channelName ($channelId)")
    }

    fun storeChannelScript(channelId: String, scriptId: String, name: String, code: String) {
        channelScripts.getOrPut(channelId) { mutableListOf() }.add(Triple(scriptId, name, code))
    }

    fun storeUrlScript(url: String, scriptId: String, name: String, code: String) {
        urlScripts.getOrPut(url) { mutableListOf() }.add(Triple(scriptId, name, code))
    }

    fun storeDomainScript(domain: String, scriptId: String, name: String, code: String) {
        domainScripts.getOrPut(domain) { mutableListOf() }.add(Triple(scriptId, name, code))
    }

    private fun injectChannelScripts(url: String) {
        if (activeChannelId == null) return

        val scriptsToInject = mutableListOf<Triple<String, String, String>>()

        channelScripts[activeChannelId]?.let { scriptsToInject.addAll(it) }

        val domain = try {
            java.net.URI(url).host ?: ""
        } catch (e: Exception) { "" }
        if (domain.isNotEmpty()) {
            domainScripts[domain]?.let { scriptsToInject.addAll(it) }
        }

        urlScripts[url]?.let { scriptsToInject.addAll(it) }

        if (scriptsToInject.isEmpty()) {
            WebTVLog.d("Main", "No scripts found for channel=$activeChannelId, url=$url")
            return
        }

        WebTVLog.d("Main", "Injecting ${scriptsToInject.size} scripts for channel=$activeChannelId on $url")
        for ((scriptId, name, code) in scriptsToInject) {
            if (scriptInjector?.injectedScriptIds?.contains(scriptId) == true) {
                WebTVLog.d("Main", "Script already injected: $name, skipping")
                continue
            }
            scriptInjector?.injectedScriptIds?.add(scriptId)

            val escapedCode = code.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")
            val injectJs = """
                (function() {
                    try {
                        var s = document.createElement('script');
                        s.textContent = '$escapedCode';
                        document.body.appendChild(s);
                        console.log('[WebTV] Script injected: $name');
                        return 'success';
                    } catch(e) {
                        return 'error: ' + e.message;
                    }
                })();
            """.trimIndent()

            webView.evaluateJavascript(injectJs) { result ->
                if (result != null && result.contains("success")) {
                    WebTVLog.d("Main", "Script injected: $name")
                } else {
                    WebTVLog.e("Main", "Failed to inject script: $name, result=$result")
                }
            }
        }
    }

    private fun initRamOverlay() {
        val parent = window.decorView.findViewById<ViewGroup>(android.R.id.content)
        if (parent !is FrameLayout) {
            WebTVLog.e("Main", "RAM overlay: root content is not FrameLayout, skipping")
            return
        }

        ramOverlay = TextView(this).apply {
            text = ""
            setTextColor(Color.argb(180, 255, 255, 255))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
            setBackgroundColor(Color.TRANSPARENT)
            val pad = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, 4f, resources.displayMetrics
            ).toInt()
            setPadding(pad, pad, pad, pad)
            isFocusable = false
            isClickable = false
            isLongClickable = false
        }

        val params = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.START
            bottomMargin = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, 8f, resources.displayMetrics
            ).toInt()
            leftMargin = TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, 8f, resources.displayMetrics
            ).toInt()
        }

        parent.addView(ramOverlay, params)
        WebTVLog.d("Main", "RAM overlay initialized")
    }

    private fun startRamMonitor() {
        if (ramHandler != null) return
        val rt = Runtime.getRuntime()
        val handler = Handler(Looper.getMainLooper())
        val overlay = ramOverlay ?: return

        val runnable = object : Runnable {
            override fun run() {
                val used = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024)
                overlay.text = "${used}MB"
                handler.postDelayed(this, 500)
            }
        }

        ramHandler = handler
        ramUpdateRunnable = runnable
        handler.post(runnable)
        WebTVLog.d("Main", "RAM monitor started")
    }

    private fun stopRamMonitor() {
        val r = ramUpdateRunnable
        if (r != null) {
            ramHandler?.removeCallbacks(r)
            ramUpdateRunnable = null
        }
        ramHandler = null
        if (ramOverlay != null) {
            ramOverlay!!.text = ""
        }
        WebTVLog.d("Main", "RAM monitor stopped")
    }
}
