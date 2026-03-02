package com.example.myapplication

import android.annotation.SuppressLint
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Response
import java.io.IOException
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

// M1 - Improper Credential Usage
// Hardcoded API keys in source code
object Config {
    const val API_SECRET = "AIzaSyB-XXXX-XXXX-XXXX-XXXX"
    const val ADMIN_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

class MainActivity : ComponentActivity() {
    private lateinit var db: SQLiteDatabase

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // M6, M9 - Insecure Data Storage / Inadequate Privacy Controls
        // Database is not encrypted, storing plain PII
        db = openOrCreateDatabase("QuickBusLite.db", MODE_PRIVATE, null)
        db.execSQL("CREATE TABLE IF NOT EXISTS users (username VARCHAR(50), role VARCHAR(20), password VARCHAR(50), pii_email VARCHAR(100));")
        // Insert a dummy user so SQL injection can actually return a user row
        db.execSQL("INSERT INTO users (username, role, password, pii_email) SELECT 'user1', 'user', '482c811da5d5b4bc6d497ffa98491e38', 'user1@test.com' WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'user1');")
        
        // M8 - Security Misconfiguration
        // Debug mode enabled, logging full stack traces and exposing sensitive logic
        Log.e("SECURITY_MISCONFIG", "QuickBusLite App Started in INSECURE mode. API_SECRET: ${Config.API_SECRET}")

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    AppNavigation(db)
                }
            }
        }
    }
}

@Composable
fun AppNavigation(db: SQLiteDatabase) {
    var currentScreen by remember { mutableStateOf("login") }

    when (currentScreen) {
        "login" -> LoginScreen(
            db = db,
            onLoginSuccess = { currentScreen = "dashboard" },
            onWebview = { currentScreen = "webview" }
        )
        "dashboard" -> DashboardScreen(
            onLogout = { currentScreen = "login" }
        )
        "webview" -> InsecureWebViewScreen()
    }
}

@SuppressLint("ApplySharedPref")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(db: SQLiteDatabase, onLoginSuccess: () -> Unit, onWebview: () -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loginResult by remember { mutableStateOf("") }
    val context = LocalContext.current

    Column(modifier = Modifier.padding(16.dp)) {
        Text("QuickBus Lite (Insecure Version)", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))
        
        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("Username") },
            modifier = Modifier.fillMaxWidth()
        )
        
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Button(onClick = {
            // M10 - Insufficient Cryptography
            // Using MD5 without salt
            val mdBytes = MessageDigest.getInstance("MD5").digest(password.toByteArray())
            val hexString = mdBytes.joinToString("") { "%02x".format(it) }

            // M4 - Insufficient Input / Output Validation
            // SQL Injection Vulnerability: directly concatenating user input
            try {
                // If the user inputs user'; DROP TABLE users; -- it will inject
                val cursor = db.rawQuery("SELECT * FROM users WHERE username = '$username' AND password = '$hexString'", null)
                
                // M3 - Insecure Authentication & Authorization
                // Just validating on UI layer / Hardcoded checks
                if (username == "admin" && password == "admin") {
                    loginResult = "Login Success as Admin!"
                    
                    // M1, M9 - Store JWT and Password in plaintext SharedPreferences
                    val prefs = context.getSharedPreferences("app_prefs", Context.MODE_PRIVATE)
                    prefs.edit().putString("auth_token", Config.ADMIN_TOKEN).commit() // M1: No rotate, stored plaintext
                    prefs.edit().putString("saved_password", password).commit()     // M9: Password plaintext
                    
                    onLoginSuccess()
                } else if (cursor.count > 0) {
                    loginResult = "Login Success from Database!"
                    onLoginSuccess()
                } else {
                    loginResult = "Invalid Credentials"
                }
                cursor.close()
            } catch (e: Exception) {
                // M8 - Expose stack trace
                loginResult = "Error: ${e.message}"
                e.printStackTrace()
            }
        }, modifier = Modifier.fillMaxWidth()) {
            Text("Login")
        }

        Spacer(modifier = Modifier.height(8.dp))

        Button(onClick = {
            onWebview()
        }, modifier = Modifier.fillMaxWidth()) {
            Text("Open Partner Site (Insecure Webview)")
        }

        Spacer(modifier = Modifier.height(16.dp))
        Text(loginResult, color = MaterialTheme.colorScheme.error)
    }
}

@Composable
fun DashboardScreen(onLogout: () -> Unit) {
    var apiResponse by remember { mutableStateOf("No Data") }

    Column(modifier = Modifier.padding(16.dp)) {
        Text("Admin Dashboard", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(16.dp))

        Button(onClick = {
            // M5 - Insecure Communication
            // Calling an HTTP endpoint instead of HTTPS, with unverified certificate
            fetchInsecureApi { response ->
                apiResponse = response
            }
        }, modifier = Modifier.fillMaxWidth()) {
            Text("Fetch Data via HTTP (No SSL Validation)")
        }

        Spacer(modifier = Modifier.height(16.dp))
        
        // M8 - Security Misconfiguration (Log API Response directly to UI/Console)
        Text("API Response: $apiResponse")
        
        Spacer(modifier = Modifier.height(32.dp))

        Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
            Text("Logout")
        }
    }
}

// M4, M5 - Insecure webview config allowing XSS and cleartext
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun InsecureWebViewScreen() {
    androidx.compose.ui.viewinterop.AndroidView(factory = { context ->
        WebView(context).apply {
            settings.javaScriptEnabled = true
            settings.allowUniversalAccessFromFileURLs = true // M8 - Security Misconfig
            webViewClient = WebViewClient()
            loadUrl("http://example.com") // M5 - Insecure Communication (HTTP)
        }
    })
}

// M5 - Insecure Communication (No SSL Pinning, Trust All Certs)
private fun fetchInsecureApi(onResult: (String) -> Unit) {
    try {
        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            @SuppressLint("TrustAllX509TrustManager")
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
            @SuppressLint("TrustAllX509TrustManager")
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        })

        val sslContext = SSLContext.getInstance("SSL")
        sslContext.init(null, trustAllCerts, SecureRandom())

        val client = OkHttpClient.Builder()
            .sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as X509TrustManager)
            .hostnameVerifier { _, _ -> true } // Trusts all hostnames
            .build()
        
        val request = Request.Builder()
            .url("http://jsonplaceholder.typicode.com/todos/1") // HTTP
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // M8 - Expose stack trace
                Log.e("API_ERROR", "Error: ${e.message}", e)
                onResult("Error: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string() ?: "Empty"
                
                // M8 - Log full system API responses
                Log.e("API_RESPONSE", "Full response: $body")
                
                onResult(body)
            }
        })
    } catch (e: Exception) {
        e.printStackTrace()
        onResult("Exception: ${e.message}")
    }
}
