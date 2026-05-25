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
import com.google.android.material.dialog.MaterialAlertDialogBuilder

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
    private var appBridgeScriptCache: String? = null
    private var widgetScriptCache: String? = null
    private var pendingMicPermissionRequest: PermissionRequest? = null

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
        private const val START_URL = "https://hellfiveosborn.github.io/WebTV/"
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

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                WebTVLog.d("Main", "onPageFinished: url=$url, currentPageUrl=$currentPageUrl, activeChannel=$activeChannelId")

                if (webView.alpha == 0f) {
                    webView.animate().alpha(1f).setDuration(200).start()
                }

                if (url != null && url != currentPageUrl) {
                    val previousUrl = currentPageUrl
                    currentPageUrl = url

                    if ((url.contains(START_URL) || url.contains("hellfiveosborn.github.io/WebTV")) && !url.contains("/channel/")) {
                        val pendingClose = closedChannelPayload
                        closedChannelPayload = null

                        pendingScriptInjection = null
                        activeChannelId = null
                        activeChannelName = null
                        listenerGuardInstalled = false
                        scriptInjector?.clearInjectedScripts()
                        WebTVLog.d("Main", "Returned to home, reset injection state (keeping preloadedScriptsPayload cache)")

                        if (pendingClose != null) {
                            webView.post { injectChannelCloseEvent(pendingClose) }
                        }
                    } else {
                        listenerGuardInstalled = false
                        WebTVLog.d("Main", "Page changed: $previousUrl -> $url")

                        if (activeChannelId != null) {
                            WebTVLog.d("Main", "Channel active ($activeChannelId), injecting into new page")
                            scriptInjector?.clearInjectedScripts()
                            resetScriptFlags()
                            injectControlScript()
                            injectAppBridgeScript()
                            injectWidgetScript()

                            if (preloadedScriptsPayload != null) {
                                injectPreloadedScripts()
                            }
                        }
                    }
                }
                injectEventListenerGuard()
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
        hideSystemBars()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (activeChannelId != null) {
            WebTVLog.d("WebTV", "BACK pressionado com canal ativo: $activeChannelName")
            val script = """
                javascript:(function() {
                    if (window.WebTV && window.WebTV.channel && window.WebTV.channel.close) {
                        window.WebTV.channel.close();
                    } else {
                        console.log('[WebTV] window.WebTV.channel.close não disponível, usando fallback');
                        if (window.WebTVBridge && window.WebTVBridge.onChannelClosed) {
                            var payload = JSON.stringify({
                                channelId: window.__webtvActiveChannelId || 'unknown',
                                channelName: window.__webtvActiveChannelName || 'Unknown',
                                timestamp: Date.now()
                            });
                            window.WebTVBridge.onChannelClosed(payload);
                        }
                    }
                })();
            """.trimIndent()
            webView.evaluateJavascript(script, null)
        } else if (webView.canGoBack()) {
            webView.goBack()
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
                        typeof window.WebTV.events === 'undefined') {
                        setTimeout(tryInstall, 100);
                        return;
                    }

                    window.WebTV.events.on('app:loaded', (event) => {
                        WebTVBridge.onAppLoaded(JSON.stringify(event.payload));
                    });

                    window.WebTV.events.on('channel:clicked', (event) => {
                        const channelId = event.payload.id;
                        const now = Date.now();
                        const cached = window.__webtvChannelCache[channelId];
                        
                        if (cached && (now - cached) < 500) {
                            console.log('Ignored duplicate channel:clicked for ' + channelId);
                            return;
                        }
                        
                        window.__webtvChannelCache[channelId] = now;
                        console.log('Dispatching channel:clicked for ' + channelId);
                        WebTVBridge.onChannelClicked(JSON.stringify(event.payload));
                    });

                    window.WebTV.events.on('player:opened', (event) => {
                        WebTVBridge.onPlayerOpened(JSON.stringify(event.payload));
                    });

                    window.WebTV.events.on('player:closed', (event) => {
                        WebTVBridge.onPlayerClosed(JSON.stringify(event.payload));
                    });

                    window.WebTV.events.on('script:retrieved', (event) => {
                        WebTVBridge.onScriptRetrieved(JSON.stringify(event.payload));
                    });

                    window.WebTV.events.on('search:changed', (event) => {
                        WebTVBridge.onSearchChanged(JSON.stringify(event.payload));
                    });

                    window.WebTV.events.on('category:changed', (event) => {
                        WebTVBridge.onCategoryChanged(JSON.stringify(event.payload));
                    });

                    window.WebTV.events.on('scripts:preloaded', (event) => {
                        WebTVBridge.onScriptsPreloaded(JSON.stringify(event.payload));
                    });

                    window.WebTV.events.on('channel:alternative:selected', (event) => {
                        WebTVBridge.onChannelAlternativeSelected(JSON.stringify(event));
                    });

                    window.WebTV.events.on('widget:channel:change', (event) => {
                        WebTVBridge.onWidgetChannelChange(JSON.stringify(event));
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
                console.log('[WebTV] Active channel set:', window.__webtvActiveChannelId, window.__webtvActiveChannelName);
            })()
        """.trimIndent()

        WebTVLog.d("Main", "Injecting control script for channel: $activeChannelId")
        scriptInjector?.injectScriptRaw(script, "ControlScript") { success ->
            if (success) {
                WebTVLog.d("Main", "Control script injected successfully")
                verifyChannelIdInjection()
            } else {
                WebTVLog.e("Main", "Failed to inject control script")
            }
        }
    }

    private fun verifyChannelIdInjection() {
        val verifyScript = """
            (function() {
                return window.__webtvActiveChannelId;
            })()
        """.trimIndent()

        webView.evaluateJavascript(verifyScript) { result ->
            val injectedId = result?.trim('"') ?: ""
            if (injectedId == activeChannelId) {
                WebTVLog.d("Main", "Verified: __webtvActiveChannelId = $injectedId")
            } else {
                WebTVLog.e("Main", "Verification failed: expected $activeChannelId, got $injectedId")
            }
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

    fun clearInjectedScriptsCache() {
        scriptInjector?.clearInjectedScripts()
        preloadedScriptsPayload = null
        WebTVLog.d("Main", "Script injection cache cleared")
    }

    fun isOnHomePage(): Boolean {
        val url = currentPageUrl ?: return true
        return (url.contains(START_URL) || url.contains("hellfiveosborn.github.io/WebTV")) && !url.contains("/channel/")
    }

    fun setCurrentChannel(channelId: String, channelName: String) {
        activeChannelId = channelId
        activeChannelName = channelName
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
        
        webView.loadUrl(START_URL)
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
        if (appBridgeScriptCache == null) {
            try {
                appBridgeScriptCache = assets.open("scripts/appBridge.js").bufferedReader().use { it.readText() }
                WebTVLog.d("WebTV", "AppBridge script carregado dos assets")
            } catch (e: Exception) {
                WebTVLog.e("WebTV", "Erro ao carregar AppBridge script: ${e.message}")
                return
            }
        }

        val script = "javascript:(function() { $appBridgeScriptCache })();"
        webView.evaluateJavascript(script, null)
        WebTVLog.d("WebTV", "AppBridge script injetado")
    }

    private fun injectWidgetScript() {
        if (activeChannelId == null) {
            WebTVLog.d("WebTV", "No active channel, skipping widget injection")
            return
        }

        if (widgetScriptCache == null) {
            try {
                widgetScriptCache = assets.open("scripts/widget.js").bufferedReader().use { it.readText() }
                WebTVLog.d("WebTV", "Widget script carregado dos assets")
            } catch (e: Exception) {
                WebTVLog.e("WebTV", "Erro ao carregar widget script: ${e.message}")
                return
            }
        }

        val baseUrlScript = """
            (function() {
                window.__webtvBaseUrl = '${START_URL}';
                window.__webtvActiveChannelId = '$activeChannelId';
            })();
        """.trimIndent()

        webView.evaluateJavascript(baseUrlScript, null)

        val script = "javascript:(function() { $widgetScriptCache })();"
        webView.evaluateJavascript(script, null)
        WebTVLog.d("WebTV", "Widget script injetado para canal: $activeChannelId")
    }

    fun navigateToAlternativeUrl(channelId: String, channelTitle: String, url: String) {
        WebTVLog.d("WebTV", "Navegando para URL alternativa: $channelTitle -> $url")
        activeChannelId = channelId
        activeChannelName = channelTitle
        resetScriptFlags()
        webView.loadUrl(url)
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
}
