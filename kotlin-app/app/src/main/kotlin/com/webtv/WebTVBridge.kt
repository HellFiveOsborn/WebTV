package com.webtv

import android.webkit.JavascriptInterface
import org.json.JSONObject

class WebTVBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun onAppLoaded(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                val channels = json.optInt("channels", 0)
                val categories = json.optInt("categories", 0)
                WebTVLog.d("Bridge", "App loaded: $channels channels, $categories categories")
                if (activity.isOnHomePage()) {
                    activity.clearInjectedScriptsCache()
                }
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing app:loaded payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onListenersReady() {
        activity.runOnUiThread {
            WebTVLog.d("Bridge", "Event listeners injected and ready")
        }
    }

    @JavascriptInterface
    fun onChannelClicked(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                val id = json.getString("id")
                val name = json.getString("name")
                val type = json.getString("type")
                WebTVLog.d("Bridge", "Channel clicked: $name (ID: $id, type: $type)")
                activity.setCurrentChannel(id, name)
                if (type == "redirect" || type == "mixed") {
                    WebTVLog.d("Bridge", "Redirect/mixed channel detected, will inject scripts when URL loads")
                    activity.setPendingScriptInjection(id, name)
                }
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing channel:clicked payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onPlayerOpened(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                val channelId = json.getString("channelId")
                val channelName = json.getString("channelName")
                val url = json.getString("url")
                WebTVLog.d("Bridge", "Player opened: $channelName - $url")
                activity.navigateToAlternativeUrl(channelId, channelName, url)
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing player:opened payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onPlayerError(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                WebTVLog.e("Bridge", "Player error: ${json.optString("message", "Unknown")}")
                activity.clearInjectedScriptsCache()
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing player:error payload", e)
                activity.clearInjectedScriptsCache()
            }
        }
    }

    @JavascriptInterface
    fun onScriptsPreloaded(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                val url = json.getString("url")
                val scriptsArray = json.getJSONArray("scripts")
                WebTVLog.d("Bridge", "Scripts preloaded for URL: $url, count: ${scriptsArray.length()}")
                activity.cachePreloadedScriptsForUrl(url, payload)
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing scripts:preloaded payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onScriptRetrieved(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                val url = json.getString("url")
                val count = json.optInt("count", 0)
                WebTVLog.d("Bridge", "Scripts retrieved for $url: $count scripts")
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing script:retrieved payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onSearchChanged(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                val query = json.getString("query")
                WebTVLog.d("Bridge", "Search changed: $query")
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing search:changed payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onCategoryChanged(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                val categoryId = json.optString("categoryId", "null")
                val categoryName = json.getString("categoryName")
                WebTVLog.d("Bridge", "Category changed: $categoryName ($categoryId)")
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing category:changed payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onFocusChanged(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                WebTVLog.d("Bridge", "Focus changed: $json")
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing focus:changed payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onChannelClosed(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                val channelId = json.getString("channelId")
                val channelName = json.getString("channelName")
                WebTVLog.d("Bridge", "Channel closed: $channelName (ID: $channelId)")
                activity.handleChannelClosed(channelId, channelName)
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing channel:close payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onChannelAlternativeSelected(eventJson: String) {
        activity.runOnUiThread {
            try {
                val event = JSONObject(eventJson)
                val payload = event.getJSONObject("payload")
                val channelId = payload.getString("channelId")
                val channelTitle = payload.getString("channelTitle")
                val url = payload.getString("url")
                val type = payload.optString("type", "")
                WebTVLog.d("Bridge", "Alternative URL selected: $channelTitle -> $url (type: $type)")
                activity.navigateToAlternativeUrl(channelId, channelTitle, url)
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing channel:alternative:selected payload", e)
            }
        }
    }

    @JavascriptInterface
    fun onWidgetAction(payload: String) {
        activity.runOnUiThread {
            try {
                val json = JSONObject(payload)
                val name = json.optString("name", "")
                val data = json.optJSONObject("payload")
                WebTVLog.d("Bridge", "Widget action: $name, payload: $data")

                if (name == "channel:alternative:selected" && data != null) {
                    val channelId = data.optString("channelId", "")
                    val channelTitle = data.optString("channelTitle", "")
                    val url = data.optString("url", "")
                    val type = data.optString("type", "")

                    WebTVLog.d("Bridge", "Alternative URL selected: $channelTitle -> $url (type: $type)")
                    activity.navigateToAlternativeUrl(channelId, channelTitle, url)
                }
            } catch (e: Exception) {
                WebTVLog.e("Bridge", "Error parsing widget action payload", e)
            }
        }
    }
}
