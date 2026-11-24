package com.elevatelabs.app;

import java.util.List;
import java.util.ArrayList;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Rational;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.UserRecoverableAuthException;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
import android.accounts.Account;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintJob;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "PipBridge")
public class PipPlugin extends Plugin {
    public static PipPlugin instance;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    public static void sendNativeBackEvent() {
        if (instance != null) {
            instance.notifyListeners("onNativeBack", new JSObject());
        }
    }

    @PluginMethod
    public void isPipSupported(PluginCall call) {
        JSObject ret = new JSObject();
        boolean supported = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getActivity() != null) {
            supported = getActivity().getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
        }
        ret.put("supported", supported);
        call.resolve(ret);
    }

    @PluginMethod
    public void enterPip(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity not available");
            return;
        }

        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    // Source rect hint for smooth transition from mini player to PiP window
                    android.graphics.Rect sourceRect = null;
                    JSObject bounds = call.getObject("bounds");
                    if (bounds != null) {
                        try {
                            float density = getActivity().getResources().getDisplayMetrics().density;
                            int x = (int) (bounds.optDouble("x", 0) * density);
                            int y = (int) (bounds.optDouble("y", 0) * density);
                            int width = (int) (bounds.optDouble("width", 0) * density);
                            int height = (int) (bounds.optDouble("height", 0) * density);
                            if (width > 0 && height > 0) {
                                sourceRect = new android.graphics.Rect(x, y, x + width, y + height);
                            }
                        } catch (Exception ignored) {}
                    }

                    boolean success = false;
                    if (getActivity() instanceof MainActivity) {
                        PictureInPictureParams params = ((MainActivity) getActivity()).buildPipParams(sourceRect);
                        if (params != null) {
                            success = getActivity().enterPictureInPictureMode(params);
                        }
                    } else {
                        PictureInPictureParams.Builder builder = new PictureInPictureParams.Builder();
                        builder.setAspectRatio(new Rational(16, 9));
                        if (sourceRect != null) {
                            builder.setSourceRectHint(sourceRect);
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            builder.setAutoEnterEnabled(true);
                        }
                        success = getActivity().enterPictureInPictureMode(builder.build());
                    }
                    JSObject ret = new JSObject();
                    ret.put("success", success);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Failed to enter PiP: " + e.getMessage());
                }
            } else {
                call.reject("Picture-in-Picture requires Android 8.0 or higher");
            }
        });
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> {
                getActivity().finishAffinity();
                call.resolve();
            });
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void getStatusBarHeight(PluginCall call) {
        JSObject ret = new JSObject();
        int heightDp = 0;
        if (getActivity() != null) {
            int resourceId = getActivity().getResources().getIdentifier("status_bar_height", "dimen", "android");
            int heightPx = 0;
            if (resourceId > 0) {
                heightPx = getActivity().getResources().getDimensionPixelSize(resourceId);
            }
            if (heightPx == 0 && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.view.WindowInsets insets = getActivity().getWindowManager().getCurrentWindowMetrics().getWindowInsets();
                heightPx = insets.getInsets(android.view.WindowInsets.Type.statusBars()).top;
            }
            float density = getActivity().getResources().getDisplayMetrics().density;
            heightDp = Math.round(heightPx / density);
        }
        ret.put("heightDp", heightDp);
        call.resolve(ret);
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        Boolean isPlaying = call.getBoolean("isPlaying", false);
        MainActivity.isVideoPlaying = Boolean.TRUE.equals(isPlaying);
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).updatePictureInPictureActions();
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void nativeGoogleSignOut(PluginCall call) {
        if (getActivity() == null) {
            call.resolve();
            return;
        }

        String serverClientId = call.getString("serverClientId", "649642031919-tmtgoi10dbdq6jka2662pqdrnkdkpp9s.apps.googleusercontent.com");
        getActivity().runOnUiThread(() -> {
            try {
                GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                    .requestProfile()
                    .requestIdToken(serverClientId)
                    .build();

                GoogleSignInClient client = GoogleSignIn.getClient(getActivity(), gso);
                client.signOut().addOnCompleteListener(signOutTask -> {
                    android.util.Log.i("PipPlugin", "Native Google signOut completed, success=" + signOutTask.isSuccessful());
                    try {
                        client.revokeAccess().addOnCompleteListener(revokeTask -> {
                            android.util.Log.i("PipPlugin", "Native Google revokeAccess completed, success=" + revokeTask.isSuccessful());
                            JSObject ret = new JSObject();
                            ret.put("success", true);
                            call.resolve(ret);
                        });
                    } catch (Exception ignored) {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        call.resolve(ret);
                    }
                });
            } catch (Exception e) {
                android.util.Log.w("PipPlugin", "Native Google Sign-Out error: " + e.getMessage());
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void nativeGoogleSignIn(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity not available");
            return;
        }

        String serverClientId = call.getString("serverClientId", "649642031919-tmtgoi10dbdq6jka2662pqdrnkdkpp9s.apps.googleusercontent.com");
        getActivity().runOnUiThread(() -> {
            try {
                GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                    .requestProfile()
                    .requestIdToken(serverClientId)
                    .build();

                GoogleSignInClient client = GoogleSignIn.getClient(getActivity(), gso);
                // Ensure client is signed out so the account chooser dialog is always presented
                client.signOut().addOnCompleteListener(signOutTask -> {
                    android.util.Log.i("PipPlugin", "Pre-sign-in signOut completed, success=" + signOutTask.isSuccessful());
                    Intent signInIntent = client.getSignInIntent();
                    startActivityForResult(call, signInIntent, "handleGoogleSignInResult");
                });
            } catch (Exception e) {
                android.util.Log.e("PipPlugin", "Google Sign-In initialization failed: " + e.getMessage(), e);
                call.reject("Google Sign-In initialization failed: " + e.getMessage());
            }
        });
    }

    @ActivityCallback
    private void handleGoogleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getData() == null) {
            call.reject("Google Sign-In cancelled");
            return;
        }

        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            if (account != null) {
                android.util.Log.i("PipPlugin", "Google Sign-In succeeded for " + account.getEmail() + ", idToken present: " + (account.getIdToken() != null));
                JSObject ret = new JSObject();
                ret.put("idToken", account.getIdToken());
                ret.put("serverAuthCode", account.getServerAuthCode());
                ret.put("email", account.getEmail());
                ret.put("displayName", account.getDisplayName());
                ret.put("photoUrl", account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);
                call.resolve(ret);
            } else {
                call.reject("Account is null");
            }
        } catch (ApiException e) {
            android.util.Log.e("PipPlugin", "Google Sign-In failed with status code " + e.getStatusCode(), e);
            call.reject("Google Sign-In error (" + e.getStatusCode() + "): " + e.getMessage(), String.valueOf(e.getStatusCode()));
        }
    }

    private static final String DRIVE_SCOPE_STRING = "oauth2:https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata";

    @PluginMethod
    public void nativeGetGoogleDriveAccessToken(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Context is not available");
            return;
        }

        GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(context);
        if (account == null || account.getAccount() == null) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("reason", "NOT_SIGNED_IN");
            ret.put("message", "No active Google account found on device. Sign in first.");
            call.resolve(ret);
            return;
        }

        String scopeString = call.getString("scopes", DRIVE_SCOPE_STRING);

        new Thread(() -> {
            try {
                String token = GoogleAuthUtil.getToken(context, account.getAccount(), scopeString);
                android.util.Log.i("PipPlugin", "Native Google Drive token acquired successfully for " + account.getEmail());
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("accessToken", token);
                ret.put("email", account.getEmail());
                ret.put("expiresIn", 3600);
                call.resolve(ret);
            } catch (UserRecoverableAuthException e) {
                android.util.Log.i("PipPlugin", "User consent required for Google Drive, launching consent dialog");
                Intent consentIntent = e.getIntent();
                if (consentIntent != null && getActivity() != null) {
                    startActivityForResult(call, consentIntent, "handleDriveConsentResult");
                } else {
                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("reason", "CONSENT_REQUIRED_NO_ACTIVITY");
                    call.resolve(ret);
                }
            } catch (Exception e) {
                android.util.Log.w("PipPlugin", "Failed to retrieve native Google Drive token: " + e.getMessage());
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("reason", "ERROR");
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        }).start();
    }

    @ActivityCallback
    private void handleDriveConsentResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Context context = getContext();
        if (context == null) {
            call.reject("Context is not available");
            return;
        }

        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("reason", "CONSENT_CANCELLED");
            ret.put("message", "Google Drive consent was cancelled by user.");
            call.resolve(ret);
            return;
        }

        GoogleSignInAccount account = GoogleSignIn.getLastSignedInAccount(context);
        if (account == null || account.getAccount() == null) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("reason", "NO_ACCOUNT_AFTER_CONSENT");
            call.resolve(ret);
            return;
        }

        String scopeString = call.getString("scopes", DRIVE_SCOPE_STRING);
        new Thread(() -> {
            try {
                String token = GoogleAuthUtil.getToken(context, account.getAccount(), scopeString);
                android.util.Log.i("PipPlugin", "Native Google Drive token acquired post-consent for " + account.getEmail());
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("accessToken", token);
                ret.put("email", account.getEmail());
                ret.put("expiresIn", 3600);
                call.resolve(ret);
            } catch (Exception e) {
                android.util.Log.e("PipPlugin", "Failed to get token after consent: " + e.getMessage(), e);
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("reason", "POST_CONSENT_ERROR");
                ret.put("error", e.getMessage());
                call.resolve(ret);
            }
        }).start();
    }

    @PluginMethod
    public void nativeGoogleSignInWithDrive(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity not available");
            return;
        }

        String serverClientId = call.getString("serverClientId", "649642031919-tmtgoi10dbdq6jka2662pqdrnkdkpp9s.apps.googleusercontent.com");
        getActivity().runOnUiThread(() -> {
            try {
                Scope driveFileScope = new Scope("https://www.googleapis.com/auth/drive.file");
                Scope driveAppDataScope = new Scope("https://www.googleapis.com/auth/drive.appdata");

                GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestEmail()
                    .requestProfile()
                    .requestIdToken(serverClientId)
                    .requestScopes(driveFileScope, driveAppDataScope)
                    .build();

                GoogleSignInClient client = GoogleSignIn.getClient(getActivity(), gso);
                Intent signInIntent = client.getSignInIntent();
                startActivityForResult(call, signInIntent, "handleGoogleSignInWithDriveResult");
            } catch (Exception e) {
                android.util.Log.e("PipPlugin", "Google Sign-In with Drive initialization failed: " + e.getMessage(), e);
                call.reject("Google Sign-In with Drive initialization failed: " + e.getMessage());
            }
        });
    }

    @ActivityCallback
    private void handleGoogleSignInWithDriveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getData() == null) {
            call.reject("Google Sign-In cancelled");
            return;
        }

        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            if (account != null && account.getAccount() != null) {
                android.util.Log.i("PipPlugin", "Google Sign-In with Drive succeeded for " + account.getEmail());
                new Thread(() -> {
                    String accessToken = null;
                    try {
                        accessToken = GoogleAuthUtil.getToken(getContext(), account.getAccount(), DRIVE_SCOPE_STRING);
                    } catch (Exception tokenErr) {
                        android.util.Log.w("PipPlugin", "Failed to pre-fetch access token: " + tokenErr.getMessage());
                    }
                    JSObject ret = new JSObject();
                    ret.put("idToken", account.getIdToken());
                    ret.put("serverAuthCode", account.getServerAuthCode());
                    ret.put("email", account.getEmail());
                    ret.put("displayName", account.getDisplayName());
                    ret.put("photoUrl", account.getPhotoUrl() != null ? account.getPhotoUrl().toString() : null);
                    ret.put("accessToken", accessToken);
                    call.resolve(ret);
                }).start();
            } else {
                call.reject("Account is null");
            }
        } catch (ApiException e) {
            android.util.Log.e("PipPlugin", "Google Sign-In with Drive failed (" + e.getStatusCode() + "): " + e.getMessage(), e);
            call.reject("Google Sign-In error (" + e.getStatusCode() + "): " + e.getMessage(), String.valueOf(e.getStatusCode()));
        }
    }

    @PluginMethod
    public void nativeClearGoogleDriveToken(PluginCall call) {
        Context context = getContext();
        String token = call.getString("token");
        if (context != null && token != null && !token.isEmpty()) {
            new Thread(() -> {
                try {
                    GoogleAuthUtil.clearToken(context, token);
                    android.util.Log.i("PipPlugin", "Native Google Drive token cleared from cache");
                } catch (Exception ignored) {}
                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            }).start();
        } else {
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        JSObject ret = new JSObject();
        if (getActivity() == null) {
            ret.put("granted", false);
            call.resolve(ret);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getActivity().checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                getActivity().requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
                ret.put("granted", false);
                ret.put("requested", true);
            } else {
                ret.put("granted", true);
            }
        } else {
            boolean enabled = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
            ret.put("granted", enabled);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void checkMediaPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        if (getActivity() == null) {
            ret.put("microphone", false);
            ret.put("camera", false);
            ret.put("photos", false);
            ret.put("allGranted", false);
            call.resolve(ret);
            return;
        }

        boolean mic = getActivity().checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        boolean cam = getActivity().checkSelfPermission(android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        boolean photos = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            photos = getActivity().checkSelfPermission(android.Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
        } else {
            photos = getActivity().checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }

        ret.put("microphone", mic);
        ret.put("camera", cam);
        ret.put("photos", photos);
        ret.put("allGranted", mic && cam && photos);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestMediaPermissions(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity not available");
            return;
        }

        List<String> perms = new ArrayList<>();
        if (getActivity().checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            perms.add(android.Manifest.permission.RECORD_AUDIO);
        }
        if (getActivity().checkSelfPermission(android.Manifest.permission.MODIFY_AUDIO_SETTINGS) != PackageManager.PERMISSION_GRANTED) {
            perms.add(android.Manifest.permission.MODIFY_AUDIO_SETTINGS);
        }
        if (getActivity().checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            perms.add(android.Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getActivity().checkSelfPermission(android.Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                perms.add(android.Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (getActivity().checkSelfPermission(android.Manifest.permission.READ_MEDIA_VIDEO) != PackageManager.PERMISSION_GRANTED) {
                perms.add(android.Manifest.permission.READ_MEDIA_VIDEO);
            }
        } else {
            if (getActivity().checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                perms.add(android.Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }

        if (!perms.isEmpty()) {
            getActivity().requestPermissions(perms.toArray(new String[0]), 202);
            JSObject ret = new JSObject();
            ret.put("requested", true);
            call.resolve(ret);
        } else {
            JSObject ret = new JSObject();
            ret.put("requested", false);
            ret.put("allGranted", true);
            call.resolve(ret);
        }
    }

    private android.graphics.Bitmap getBitmapFromDrawable(android.graphics.drawable.Drawable drawable) {
        if (drawable == null) return null;
        if (drawable instanceof android.graphics.drawable.BitmapDrawable) {
            return ((android.graphics.drawable.BitmapDrawable) drawable).getBitmap();
        }
        int width = drawable.getIntrinsicWidth() > 0 ? drawable.getIntrinsicWidth() : 128;
        int height = drawable.getIntrinsicHeight() > 0 ? drawable.getIntrinsicHeight() : 128;
        android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(width, height, android.graphics.Bitmap.Config.ARGB_8888);
        android.graphics.Canvas canvas = new android.graphics.Canvas(bitmap);
        drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
        drawable.draw(canvas);
        return bitmap;
    }

    @PluginMethod
    public void showNativeNotification(PluginCall call) {
        String title = call.getString("title", "Elevate Update");
        String body = call.getString("body", "");
        int notifId = call.getInt("id", (int) System.currentTimeMillis());

        Context context = getContext();
        if (context == null) {
            call.reject("Context is null");
            return;
        }

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        String channelId = "elevate_updates_channel";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                channelId,
                "Elevate Updates",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Academic curriculum updates, new lectures, and mock tests");
            channel.enableVibration(true);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }

        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            notifId,
            intent,
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE : PendingIntent.FLAG_UPDATE_CURRENT
        );

        int smallIconRes = context.getResources().getIdentifier("ic_notification", "drawable", context.getPackageName());
        if (smallIconRes == 0) {
            smallIconRes = android.R.drawable.ic_popup_reminder;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            .setSmallIcon(smallIconRes)
            .setColor(0xFF0B57D0)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        if (manager != null) {
            manager.notify(notifId, builder.build());
        }

        JSObject res = new JSObject();
        res.put("success", true);
        call.resolve(res);
    }

    @PluginMethod
    public void setNativeTheme(PluginCall call) {
        String theme = call.getString("theme", "light");
        Context context = getContext();
        if (context != null) {
            android.content.SharedPreferences prefs = context.getSharedPreferences("ElevateAppPrefs", Context.MODE_PRIVATE);
            prefs.edit().putString("app_theme", theme).apply();
            
            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> {
                    MainActivity.applyAppNightMode(context, theme);
                });
            }
        }
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    private WebView printWebView;

    @PluginMethod
    public void print(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity not available");
            return;
        }

        String title = call.getString("title", "Elevate Document");
        String html = call.getString("html", "");

        if (html == null || html.trim().isEmpty()) {
            call.reject("HTML content is required for printing");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                // Keep strong reference on UI thread so GC does not collect WebView while spooling
                printWebView = new WebView(getActivity());
                WebSettings settings = printWebView.getSettings();
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setAllowFileAccess(true);
                settings.setAllowContentAccess(true);

                printWebView.setWebViewClient(new WebViewClient() {
                    private boolean hasPrinted = false;

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        if (hasPrinted) return;
                        hasPrinted = true;

                        try {
                            PrintManager printManager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                            if (printManager == null) {
                                call.reject("PrintManager service not available");
                                return;
                            }

                            String jobName = (title != null && !title.trim().isEmpty())
                                ? title.trim()
                                : "Elevate Document";

                            PrintDocumentAdapter printAdapter = view.createPrintDocumentAdapter(jobName);
                            PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setResolution(new PrintAttributes.Resolution("elevate_print_res", "Elevate Print", 300, 300))
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();

                            PrintJob printJob = printManager.print(jobName, printAdapter, attributes);

                            JSObject ret = new JSObject();
                            ret.put("success", true);
                            ret.put("started", printJob != null);
                            call.resolve(ret);
                        } catch (Exception ex) {
                            android.util.Log.e("PipPlugin", "Native printing failed: " + ex.getMessage(), ex);
                            call.reject("Native printing failed: " + ex.getMessage());
                        }
                    }
                });

                // Load with base URL so relative paths or local assets work
                printWebView.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
            } catch (Exception e) {
                android.util.Log.e("PipPlugin", "Setup printing WebView error: " + e.getMessage(), e);
                call.reject("Setup printing WebView error: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        Context context = getContext();
        if (context == null || getActivity() == null) {
            call.reject("Context or Activity not available");
            return;
        }

        String filename = call.getString("filename", "downloaded_file");
        String base64Data = call.getString("base64", "");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        boolean openShare = call.getBoolean("openShare", true);

        if (base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("Base64 data is required");
            return;
        }

        // Clean base64 data if it contains a Data URL prefix (e.g., data:image/png;base64,...)
        String cleanBase64 = base64Data;
        int commaIndex = cleanBase64.indexOf(",");
        if (commaIndex != -1 && cleanBase64.substring(0, commaIndex).contains(";base64")) {
            cleanBase64 = cleanBase64.substring(commaIndex + 1);
        }
        cleanBase64 = cleanBase64.replaceAll("\\s+", "");

        byte[] fileBytes;
        try {
            fileBytes = Base64.decode(cleanBase64, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("Failed to decode base64 data: " + e.getMessage());
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                boolean savedToDownloads = false;

                // 1. Save directly to device public Downloads directory
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    try {
                        ContentValues values = new ContentValues();
                        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

                        ContentResolver resolver = context.getContentResolver();
                        Uri collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                        Uri itemUri = resolver.insert(collection, values);

                        if (itemUri != null) {
                            try (OutputStream os = resolver.openOutputStream(itemUri)) {
                                if (os != null) {
                                    os.write(fileBytes);
                                    os.flush();
                                    savedToDownloads = true;
                                }
                            }
                            values.clear();
                            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                            resolver.update(itemUri, values, null, null);
                        }
                    } catch (Exception e) {
                        android.util.Log.w("PipPlugin", "MediaStore.Downloads write failed: " + e.getMessage());
                    }
                }

                if (!savedToDownloads) {
                    try {
                        File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                        if (!downloadsDir.exists()) {
                            downloadsDir.mkdirs();
                        }
                        File destFile = new File(downloadsDir, filename);
                        try (FileOutputStream fos = new FileOutputStream(destFile)) {
                            fos.write(fileBytes);
                            fos.flush();
                            savedToDownloads = true;
                        }
                        MediaScannerConnection.scanFile(context, new String[]{destFile.getAbsolutePath()}, new String[]{mimeType}, null);
                    } catch (Exception e) {
                        android.util.Log.w("PipPlugin", "Public directory write failed: " + e.getMessage());
                    }
                }

                // 2. Also save to app cache directory to generate a FileProvider URI for immediate viewing/sharing
                File cacheFile = new File(context.getCacheDir(), filename);
                try (FileOutputStream fos = new FileOutputStream(cacheFile)) {
                    fos.write(fileBytes);
                    fos.flush();
                }

                Uri shareUri = null;
                try {
                    shareUri = FileProvider.getUriForFile(
                        context,
                        context.getPackageName() + ".fileprovider",
                        cacheFile
                    );
                } catch (Exception e) {
                    android.util.Log.w("PipPlugin", "FileProvider getUriForFile failed: " + e.getMessage());
                }

                // Show native Toast confirmation
                Toast.makeText(context, "Saved to Downloads: " + filename, Toast.LENGTH_SHORT).show();

                // 3. Open Android system Share / View chooser so user can open in PDF viewer, save to Drive, send to WhatsApp, etc.
                if (openShare && shareUri != null) {
                    try {
                        Intent shareIntent = new Intent(Intent.ACTION_SEND);
                        shareIntent.setType(mimeType);
                        shareIntent.putExtra(Intent.EXTRA_STREAM, shareUri);
                        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                        Intent chooser = Intent.createChooser(shareIntent, "Save or Share: " + filename);
                        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        context.startActivity(chooser);
                    } catch (Exception e) {
                        android.util.Log.w("PipPlugin", "Share chooser launch failed: " + e.getMessage());
                    }
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("savedToDownloads", savedToDownloads);
                ret.put("filename", filename);
                call.resolve(ret);
            } catch (Exception ex) {
                android.util.Log.e("PipPlugin", "downloadFile failed: " + ex.getMessage(), ex);
                call.reject("Download failed: " + ex.getMessage());
            }
        });
    }
}
