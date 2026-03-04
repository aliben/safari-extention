import Foundation

final class NativeBridgeRouter {
    private let handler = NativeBridgeCommandHandler()

    func route(message: Any?) -> [String: Any] {
        guard let envelope = message as? [String: Any] else {
            return [
                "status": "error",
                "message": "Invalid native bridge message format.",
            ]
        }

        let type = envelope["type"] as? String ?? ""
        let payload = envelope["payload"] as? [String: Any] ?? [:]

        if type.isEmpty {
            return [
                "status": "error",
                "message": "Missing command type.",
            ]
        }

        return handler.handle(type: type, payload: payload)
    }
}
