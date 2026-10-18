import AppIntents
import SwiftUI
import WidgetKit

private enum PresenceStorage {
    static let appGroup = "group.de.teqkoiii.campusgym"
    static let key = "campusGymPresence"
    static let widgetKind = "CampusGymPresenceWidget"

    static func currentState() -> PresenceState {
        guard
            let raw = UserDefaults(suiteName: appGroup)?.string(forKey: key),
            let data = raw.data(using: .utf8),
            let value = try? JSONDecoder().decode(PresenceState.self, from: data)
        else {
            return PresenceState(isPresent: false, updatedAt: nil, scope: "this-device-demo")
        }
        return value
    }

    static func save(isPresent: Bool) throws {
        guard let defaults = UserDefaults(suiteName: appGroup) else {
            throw PresenceIntentError.sharedStorageUnavailable
        }
        let state = PresenceState(
            isPresent: isPresent,
            updatedAt: ISO8601DateFormatter().string(from: Date()),
            scope: "this-device-demo"
        )
        let data = try JSONEncoder().encode(state)
        guard let raw = String(data: data, encoding: .utf8) else {
            throw PresenceIntentError.invalidState
        }
        defaults.set(raw, forKey: key)
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    }
}

struct PresenceState: Codable {
    let isPresent: Bool
    let updatedAt: String?
    let scope: String
}

private enum PresenceIntentError: Error {
    case sharedStorageUnavailable
    case invalidState
}

struct PresenceEntry: TimelineEntry {
    let date: Date
    let state: PresenceState
}

struct PresenceTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> PresenceEntry {
        PresenceEntry(
            date: Date(),
            state: PresenceState(isPresent: false, updatedAt: nil, scope: "this-device-demo")
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PresenceEntry) -> Void) {
        completion(PresenceEntry(date: Date(), state: PresenceStorage.currentState()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PresenceEntry>) -> Void) {
        let entry = PresenceEntry(date: Date(), state: PresenceStorage.currentState())
        completion(Timeline(entries: [entry], policy: .never))
    }
}

struct CheckInIntent: AppIntent {
    static var title: LocalizedStringResource = "Ich bin drin"
    static var description = IntentDescription("Markiert den Check-in auf diesem Gerät.")

    func perform() async throws -> some IntentResult {
        try PresenceStorage.save(isPresent: true)
        return .result()
    }
}

struct CheckOutIntent: AppIntent {
    static var title: LocalizedStringResource = "Ich gehe"
    static var description = IntentDescription("Markiert den Check-out auf diesem Gerät.")

    func perform() async throws -> some IntentResult {
        try PresenceStorage.save(isPresent: false)
        return .result()
    }
}

struct PresenceWidgetEntryView: View {
    let entry: PresenceEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Campus Gym")
                .font(.headline)
                .foregroundStyle(.white)

            Text(entry.state.isPresent ? "Als anwesend markiert" : "Nicht eingecheckt")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.9))

            Text("Demo · nur dieses Gerät")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.65))

            HStack(spacing: 8) {
                Button(intent: CheckInIntent()) {
                    Text("Ich bin drin")
                        .frame(maxWidth: .infinity)
                }
                .tint(.green)
                .disabled(entry.state.isPresent)

                Button(intent: CheckOutIntent()) {
                    Text("Ich gehe")
                        .frame(maxWidth: .infinity)
                }
                .tint(.red)
                .disabled(!entry.state.isPresent)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .containerBackground(Color(red: 0.06, green: 0.09, blue: 0.16), for: .widget)
    }
}

struct CampusGymPresenceWidget: Widget {
    let kind = PresenceStorage.widgetKind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PresenceTimelineProvider()) { entry in
            PresenceWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Campus Gym Check-in")
        .description("Check-in oder Check-out mit einer Berührung.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

@main
struct CampusGymPresenceWidgetBundle: WidgetBundle {
    var body: some Widget {
        CampusGymPresenceWidget()
    }
}
