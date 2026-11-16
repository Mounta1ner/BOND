package at.meintraining.fitness;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import org.json.JSONObject;

public class BondFocusWidgetProvider extends AppWidgetProvider {

    private static final String PREFS = "BondWidgetPrefs";
    private static final String KEY_JSON = "bond_widget_payload_v1";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            updateSingleWidget(context, manager, id);
        }
    }

    public static void savePayloadAndRefresh(Context context, String jsonStr) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
               .edit()
               .putString(KEY_JSON, jsonStr)
               .apply();

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, BondFocusWidgetProvider.class));
        for (int id : ids) {
            updateSingleWidget(context, manager, id);
        }
    }

    private static void updateSingleWidget(Context context, AppWidgetManager manager, int widgetId) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_JSON, null);
        String status = "🧠 BOND · Body & Mind Training";
        String mantra = "„Ich darf gute 80 % leisten und im Hier und Jetzt handeln.“";
        String reflection = "Tippen für deinen heutigen Fokus & Quick-Check";
        String action = "quick_check";
        String targetId = "";

        if (raw != null && !raw.isEmpty()) {
            try {
                JSONObject obj = new JSONObject(raw);
                status = obj.optString("statusLine", status);
                String perm = obj.optString("permissionThought", "");
                if (!perm.isEmpty()) {
                    mantra = "„" + perm + "“";
                }
                String refl = obj.optString("reflectionQuestion", "");
                if (!refl.isEmpty()) {
                    reflection = "Reflexion: " + refl;
                }
                action = obj.optString("tapAction", "quick_check");
                targetId = obj.optString("targetId", "");
            } catch (Exception ignored) {
            }
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_bond_focus);
        views.setTextViewText(R.id.widget_status, status);
        views.setTextViewText(R.id.widget_mantra, mantra);
        views.setTextViewText(R.id.widget_reflection, reflection);

        Intent launchIntent = new Intent(context, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        launchIntent.putExtra("bondWidgetAction", action);
        launchIntent.putExtra("targetId", targetId);

        PendingIntent pending = PendingIntent.getActivity(
            context,
            widgetId,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pending);
        manager.updateAppWidget(widgetId, views);
    }
}