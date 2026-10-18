package de.teqkoiii.campusgym;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public class PresenceWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_CHECK_IN = "de.teqkoiii.campusgym.action.CHECK_IN";
    private static final String ACTION_CHECK_OUT = "de.teqkoiii.campusgym.action.CHECK_OUT";
    private static final String STORAGE_GROUP = "group.de.teqkoiii.campusgym";
    private static final String STORAGE_KEY = "campusGymPresence";

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_CHECK_IN.equals(action) || ACTION_CHECK_OUT.equals(action)) {
            savePresence(context, ACTION_CHECK_IN.equals(action));
            updateAllWidgets(context);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) {
            updateWidget(context, manager, widgetId);
        }
    }

    private static void savePresence(Context context, boolean isPresent) {
        JSONObject state = new JSONObject();
        try {
            state.put("isPresent", isPresent);
            SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
            state.put("updatedAt", formatter.format(new Date()));
            state.put("scope", "this-device-demo");
        } catch (JSONException ignored) {
            return;
        }

        context.getSharedPreferences(STORAGE_GROUP, Context.MODE_PRIVATE)
            .edit()
            .putString(STORAGE_KEY, state.toString())
            .apply();
    }

    private static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] widgetIds = manager.getAppWidgetIds(new ComponentName(context, PresenceWidgetProvider.class));
        for (int widgetId : widgetIds) {
            updateWidget(context, manager, widgetId);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        boolean isPresent = false;
        String raw = context.getSharedPreferences(STORAGE_GROUP, Context.MODE_PRIVATE)
            .getString(STORAGE_KEY, null);
        if (raw != null) {
            try {
                isPresent = new JSONObject(raw).optBoolean("isPresent", false);
            } catch (JSONException ignored) {
                isPresent = false;
            }
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.presence_widget);
        views.setTextViewText(
            R.id.presence_status,
            context.getText(isPresent ? R.string.presence_widget_checked_in : R.string.presence_widget_checked_out)
        );
        views.setBoolean(R.id.check_in_button, "setEnabled", !isPresent);
        views.setBoolean(R.id.check_out_button, "setEnabled", isPresent);
        views.setOnClickPendingIntent(R.id.check_in_button, actionIntent(context, ACTION_CHECK_IN, 1));
        views.setOnClickPendingIntent(R.id.check_out_button, actionIntent(context, ACTION_CHECK_OUT, 2));
        manager.updateAppWidget(widgetId, views);
    }

    private static PendingIntent actionIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, PresenceWidgetProvider.class).setAction(action);
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
