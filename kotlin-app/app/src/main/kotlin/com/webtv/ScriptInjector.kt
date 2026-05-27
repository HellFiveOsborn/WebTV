package com.webtv

import android.webkit.WebView
import android.webkit.ValueCallback
import org.json.JSONArray
import org.json.JSONObject

class ScriptInjector(private val webView: WebView) {
    val injectedScriptIds = mutableSetOf<String>()
    private val pendingScripts = mutableListOf<Pair<String, String>>()

    fun injectScriptRaw(code: String, name: String, callback: ((Boolean) -> Unit)? = null) {
        injectScriptWithRetry(code, name, "", 0, callback)
    }

    fun clearInjectedScripts() {
        injectedScriptIds.clear()
        WebTVLog.d("Inject", "Cleared injected scripts cache")
    }

    fun cacheScriptsForUrl(url: String, scripts: List<Pair<String, String>>) {
        pendingScripts.clear()
        pendingScripts.addAll(scripts)
        WebTVLog.d("Inject", "Cached ${scripts.size} scripts for URL: $url")
    }

    fun injectCachedScripts(callback: ((Int) -> Unit)? = null) {
        if (pendingScripts.isEmpty()) {
            WebTVLog.d("Inject", "No cached scripts to inject")
            callback?.invoke(0)
            return
        }

        WebTVLog.d("Inject", "Injecting ${pendingScripts.size} cached scripts")
        var injectedCount = 0

        for ((index, script) in pendingScripts.withIndex()) {
            val (name, code) = script
            val scriptId = "cached_${name}_${index}"

            if (injectedScriptIds.contains(scriptId)) {
                WebTVLog.d("Inject", "Script already injected: $name (ID: $scriptId), skipping...")
                continue
            }

            WebTVLog.d("Inject", "Injecting cached script[$index]: $name (ID: $scriptId)")
            injectScriptWithRetry(code, name, "", 0)
            injectedScriptIds.add(scriptId)
            injectedCount++
        }

        WebTVLog.d("Inject", "Actually injected $injectedCount cached scripts (out of ${pendingScripts.size} total)")
        pendingScripts.clear()
        callback?.invoke(injectedCount)
    }

    fun injectPreloadedScripts(payload: String, callback: ((Int) -> Unit)? = null) {
        try {
            val json = JSONObject(payload)
            val scriptsArray = json.getJSONArray("scripts")
            val count = scriptsArray.length()
            WebTVLog.d("Inject", "Found $count preloaded scripts")

            if (count == 0) {
                WebTVLog.d("Inject", "No preloaded scripts to inject")
                callback?.invoke(0)
                return
            }

            var injectedCount = 0

            for (i in 0 until count) {
                val scriptObj = scriptsArray.getJSONObject(i)
                val scriptId = scriptObj.getString("id")
                val code = scriptObj.getString("code")
                val name = scriptObj.optString("name", "unnamed")

                if (injectedScriptIds.contains(scriptId)) {
                    WebTVLog.d("Inject", "Preloaded script already injected: $name (ID: $scriptId), skipping...")
                    continue
                }

                WebTVLog.d("Inject", "Injecting preloaded script[$i]: $name (ID: $scriptId)")
                injectScriptWithRetry(code, name, "", 0)
                injectedScriptIds.add(scriptId)
                injectedCount++
            }

            WebTVLog.d("Inject", "Injected $injectedCount preloaded scripts (out of $count total)")
            callback?.invoke(injectedCount)

        } catch (e: Exception) {
            WebTVLog.e("Inject", "Error injecting preloaded scripts", e)
            callback?.invoke(0)
        }
    }

    fun injectScriptsForUrl(url: String, callback: ((Int) -> Unit)? = null) {
        val escapedUrl = url.replace("'", "\\'").replace("\\", "\\\\")
        val script = """
            (function() {
                if (typeof window.WebTV === 'undefined' || typeof window.WebTV.scripts === 'undefined') {
                    return JSON.stringify([]);
                }
                var scripts = window.WebTV.scripts.getScriptsForUrl('$escapedUrl');
                return JSON.stringify(scripts || []);
            })()
        """.trimIndent()

        webView.evaluateJavascript(script, ValueCallback { result ->
            try {
                val sanitized = result.removeSurrounding("\"").replace("\\\"", "\"")
                val jsonStr = sanitized.replace("\\\\", "\\").trim()

                if (jsonStr == "null" || jsonStr == "[]" || jsonStr.isEmpty()) {
                    WebTVLog.d("Inject", "No scripts found for URL: $url")
                    callback?.invoke(0)
                    return@ValueCallback
                }

                val scripts = JSONArray(jsonStr)
                val count = scripts.length()
                WebTVLog.d("Inject", "Found $count scripts for URL: $url")

                var injectedCount = 0

                for (i in 0 until count) {
                    val scriptObj = scripts.getJSONObject(i)
                    val scriptId = scriptObj.optString("id") ?: "${url}_$i"
                    val code = scriptObj.getString("code")
                    val name = scriptObj.optString("name", "unnamed")

                    if (injectedScriptIds.contains(scriptId)) {
                        WebTVLog.d("Inject", "Script already injected: $name (ID: $scriptId), skipping...")
                        continue
                    }

                    WebTVLog.d("Inject", "Injecting script[$i]: $name (ID: $scriptId)")
                    injectScriptWithRetry(code, name, url, 0)
                    injectedScriptIds.add(scriptId)
                    injectedCount++
                }

                WebTVLog.d("Inject", "Actually injected $injectedCount new scripts (out of $count total)")
                callback?.invoke(injectedCount)

            } catch (e: Exception) {
                WebTVLog.e("Inject", "Error parsing scripts response for $url", e)
                WebTVLog.e("Inject", "Raw result: $result")
                callback?.invoke(0)
            }
        })
    }

    private fun injectScriptWithRetry(code: String, scriptName: String, targetUrl: String, attempt: Int, callback: ((Boolean) -> Unit)? = null) {
        if (attempt >= 10) {
            WebTVLog.e("Inject", "Failed to inject script '$scriptName' after $attempt attempts")
            callback?.invoke(false)
            return
        }

        val jsCode = code.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")
        val escapedTargetUrl = targetUrl.replace("'", "\\'")

        val injectionScript = """
            (function() {
                try {
                    if (typeof window.WebTV === 'undefined') {
                        window.WebTV = {}
                    }
                    if (!window.WebTV.injectedScripts) {
                        window.WebTV.injectedScripts = {}
                    }
                    if (!window.WebTV.scripts) {
                        window.WebTV.scripts = {
                            getScriptsForUrl: function() { return [] }
                        }
                    }

                    var iframeIndex = -1
                    try {
                        var iframes = window.frames
                        for (var i = 0; i < iframes.length; i++) {
                            try {
                                var iframeUrl = iframes[i].location.href
                                if (iframeUrl && iframeUrl.includes('$escapedTargetUrl')) {
                                    iframeIndex = i
                                    break
                                }
                            } catch (crossOriginErr) {
                                iframeIndex = i
                                break
                            }
                        }
                    } catch (e) {}

                    if (iframeIndex < 0) {
                        var scriptId = '$scriptName-' + window.location.href
                        if (window.WebTV.injectedScripts[scriptId]) {
                            console.log('[ScriptInjector] Already injected in main page: $scriptName')
                            return 'already-injected'
                        }

                        var script = document.createElement('script')
                        script.textContent = '$jsCode'
                        document.body.appendChild(script)
                        window.WebTV.injectedScripts[scriptId] = true

                        console.log('[ScriptInjector] Main page (redirect) - script injected: $scriptName')
                        return 'success'
                    }

                    var scriptId = '$scriptName-' + window.frames[iframeIndex].location.href
                    if (window.WebTV.injectedScripts[scriptId]) {
                        console.log('[ScriptInjector] Already injected in iframe ' + iframeIndex + ': $scriptName')
                        return 'already-injected'
                    }

                    var iframe = window.frames[iframeIndex]
                    var script = iframe.document.createElement('script')
                    script.textContent = '$jsCode'
                    iframe.document.body.appendChild(script)
                    window.WebTV.injectedScripts[scriptId] = true

                    console.log('[ScriptInjector] Iframe ' + iframeIndex + ' - script injected: $scriptName')
                    return 'success'
                } catch (e) {
                    console.error('[ScriptInjector] Error injecting $scriptName: ' + e.message)
                    return 'error: ' + e.message
                }
            })()
        """.trimIndent()

        webView.evaluateJavascript(injectionScript, ValueCallback { result ->
            WebTVLog.d("Inject", "Injection result for $scriptName: $result")
            val trimmed = result?.trim('"') ?: ""
            val success = trimmed == "success" || trimmed == "already-injected"
            if (success) {
                callback?.invoke(true)
            } else {
                WebTVLog.d("Inject", "Injecting '$scriptName' failed ($attempt/10), retrying in 5s...")
                android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                    injectScriptWithRetry(code, scriptName, targetUrl, attempt + 1, callback)
                }, 5000)
            }
        })
    }
}
