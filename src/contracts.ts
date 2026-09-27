/**
 * Wire contracts.
 *
 * These mirror the schemas declared by the `server.device`, `server.handoff` and `server.session`
 * groups of the opencode HttpApi, plus the legacy V1 session shape.
 *
 * They are declared here rather than imported from `@opencode-ai/client` so this app is a
 * standalone repository: it is a client of the API, not a package inside the opencode monorepo.
 * The pairing, handoff and device endpoints require the fork described in the README, so the
 * published client package would not describe them anyway.
 */

export type Session = {
  readonly id: string
  readonly title: string
  readonly time: { readonly created: number; readonly updated: number }
}

export type Device = {
  readonly id: string
  readonly name: string
  readonly kind: "mobile" | "desktop"
  readonly platform?: string
  readonly time_created: number
  readonly time_updated: number
  readonly time_last_seen: number
}

export type DevicePairing = {
  readonly device: Device
  /** Returned exactly once. Only its hash is persisted server side. */
  readonly token: string
}

export type Handoff = {
  readonly id: string
  readonly sessionID: string
  readonly deviceID: string
  readonly deviceName: string
  readonly status: "pending" | "accepted" | "declined"
  readonly note?: string
  readonly time_created: number
  readonly time_updated: number
}
