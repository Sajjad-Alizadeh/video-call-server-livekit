# React invitation integration plan

Goal: provide generated self-hosted configuration, room-scoped invitations, a runnable React client, and a complete operating guide.

Constraints: no login system yet; use invitation codes. Keep Docker packaging for later. Keep backend and LiveKit secrets out of browser code.

- [x] Add HMAC-signed, expiring invitations with fixed room, identity and role, a server-side invitation CLI, and a browser-facing `/api/join` exchange route.
- [x] Generate matching backend environment and LiveKit YAML with random credentials, refusing overwrites. Support local and future production generation with a supplied domain.
- [x] Add a standalone React/Vite example using LiveKitRoom and VideoConference, with a same-origin join proxy, visible errors, and media choices.
- [x] Document architecture, local startup, React integration, invitation lifecycle, admin APIs, Ubuntu configuration, and troubleshooting.
- [x] Verify invitation tampering, expiry and privilege boundaries, setup file generation, React build, and real-server integration.

Execute inline in the current authorized workspace.

Validation: all 14 tests passed with generated credentials against LiveKit v1.13.10. Node syntax checks and React production build passed. Headless Chrome rendered the join form; the Vite proxy exchanged valid invitations and rejected invalid ones. nginx -t passed in an isolated container with throwaway test certificates. Temporary test services were stopped. Browser-to-browser media and real Ubuntu DNS/TLS/TURN are not verified. Context7 again failed with npm ETARGET; official web docs and installed SDK sources were used.
