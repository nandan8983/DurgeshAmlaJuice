package com.riderapp

import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule

class AppInfoModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AppInfo"

  override fun getConstants(): MutableMap<String, Any> {
    val constants = mutableMapOf<String, Any>()
    try {
      val context = reactApplicationContext
      val pm = context.packageManager
      val info =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            pm.getPackageInfo(context.packageName, PackageManager.PackageInfoFlags.of(0))
          } else {
            @Suppress("DEPRECATION") pm.getPackageInfo(context.packageName, 0)
          }
      constants["versionName"] = info.versionName ?: "0.1.0"
      val code =
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            info.longVersionCode.toInt()
          } else {
            @Suppress("DEPRECATION") info.versionCode
          }
      constants["versionCode"] = code
    } catch (_: Exception) {
      constants["versionName"] = "0.1.0"
      constants["versionCode"] = 1
    }
    return constants
  }
}

