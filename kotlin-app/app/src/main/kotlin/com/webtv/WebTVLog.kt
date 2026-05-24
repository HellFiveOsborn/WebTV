package com.webtv

import android.util.Log

object WebTVLog {
    private const val TAG = "WebTV"

    fun d(source: String, message: String) {
        Log.d(TAG, "[$source] $message")
    }

    fun e(source: String, message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.e(TAG, "[$source] $message", throwable)
        } else {
            Log.e(TAG, "[$source] $message")
        }
    }

    fun i(source: String, message: String) {
        Log.i(TAG, "[$source] $message")
    }

    fun w(source: String, message: String) {
        Log.w(TAG, "[$source] $message")
    }
}
