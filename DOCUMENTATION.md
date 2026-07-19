# ioBroker.ecovacs-deebot — Project Documentation

## Overview

**ioBroker.ecovacs-deebot** is an ioBroker adapter that integrates Ecovacs Deebot, Yeedi, and AIRBOT devices into the ioBroker smart-home ecosystem. GOAT lawn-mower devices may partially work but are community-supported only and not actively maintained. It uses the companion library [ecovacs-deebot.js](https://github.com/mrbungle64/ecovacs-deebot.js) for all low-level communication and exposes device state and control via the ioBroker object tree.

- **Adapter version:** 2.0.x (alpha – multi-device architecture)
- **Library version:** 1.0.0-alpha (ecovacs-deebot npm package)
- **Node.js required:** >= 20.x
- **Protocol:** Pure MQTT/JSON (legacy XMPP/XML devices are dropped in v2)
- **Author:** Sascha Hölzel
- **License:** MIT

---

## Architecture

The project is split into two distinct layers:

```
ioBroker.ecovacs-deebot (Adapter)
  ├── State Management   – Creates and maintains the ioBroker object tree
  ├── Event Mapping      – Translates library events into ioBroker state changes
  └── Extended Logic     – Command queueing, throttling, map rendering, etc.

ecovacs-deebot.js (Library / npm dependency)
  ├── HTTP Authentication – Login with Ecovacs credentials, device discovery
  ├── MQTT Connection     – Persistent MQTT connection per device
  ├── Command Registry    – Sends JSON commands to the robot
  ├── Event Emitter       – Emits typed events for every state change
  └── Model System        – Maps device class IDs to capabilities
```

### Multi-Device Architecture (v2)

Version 2 manages **all devices on a single account in one adapter instance**. Internally, the adapter maintains a `Map<deviceId, DeviceContext>` where each `DeviceContext` wraps a single `VacBot` instance, its state cache, and its per-device request queue.

---

## Installation & Prerequisites

1. Have a working ioBroker installation.
2. Register your robot in the official Ecovacs Home (or Yeedi) app first.
3. Install the adapter via the ioBroker admin UI or:
   ```bash
   npm install iobroker.ecovacs-deebot
   ```
4. **Map rendering:** Map images are rendered as Base64 PNG out of the box — no extra dependencies. Rendering is pure JavaScript now (the native `canvas` module is no longer required).

### Configuration (Admin UI)

The settings are split into two tabs: **Account** (one set of values for the whole instance) and **Devices** (feature toggles configured individually per device).

#### Account

| Field | Description |
| :--- | :--- |
| E-Mail / Account ID | The account email used in the Ecovacs or Yeedi app |
| Password | Account password (stored encrypted via `encryptedNative`) |
| Country | Two-letter ISO country code (e.g. `de`, `us`) |
| Auth domain | Leave empty for Ecovacs; use `yeedi.com` for Yeedi accounts |
| Polling interval | How often device states are actively polled (seconds) |
| Language for spot area labels | Language used for spot-area names, when the model supports labels |
| Single device mode | Connect only one device and flatten its object tree (omit the device-id prefix) |
| Device (single device mode) | Which device to connect when single device mode is enabled |

#### Devices (per-device features)

Version 2 manages every device on the account, so most feature toggles are configured **individually per device** on this tab.

- **The list is auto-populated.** On each successful connection the adapter adds an entry for every discovered device (`ensureDeviceConfigEntries` in `main.js`), pre-filling a friendly **Name** and the read-only **Device ID**. You just expand an entry and set the features you want — no device IDs to look up or paste. The first time a new device is discovered the adapter writes the configuration and restarts once to apply it.
- **Three-state toggles.** Each feature is either **pre-selection** (let the adapter auto-detect support from the model — the default), **enable**, or **disable**. Choice/numeric options (thresholds, area sizes, etc.) work the same way, with a sensible default.
- **Standard and Experimental groups.** Experimental features are unlocked at your own risk; their behaviour and availability vary from model to model.
- **Resolution order at runtime:** a per-device override (when set) wins; otherwise the model's automatic capability detection applies. A feature left at *pre-selection* always defers to auto-detection. For instances upgraded from older versions, any previously global feature value is still honoured as a fallback until a per-device value is set.

> Entries are auto-managed: there is no manual *add*, and *delete* is disabled. An entry for a device that is later removed from the account simply lingers and is harmless.

### Docker / Container Deployment

A `Dockerfile` and `docker-compose.yml` are provided in the repository root for running the adapter in a container based on `buanet/iobroker`.

#### Auto-Configuration on First Start

You can pass your Ecovacs credentials to the container using a `.env` file to auto-configure the adapter on first start.

1. **Setup Environment File:**
   Copy `.env.example` to `.env` and configure your credentials:
   ```env
   ECOVACS_EMAIL=your-email@example.com
   ECOVACS_PASSWORD=your-password
   ECOVACS_COUNTRY=de
   ```

2. **Docker Compose:**
   The `docker-compose.yml` is configured to load these variables and pass them to the container. Run:
   ```bash
   docker compose up -d
   ```

3. **How it works:**
   On the container's very first startup, the `.docker/userscripts/userscript_firststart.sh` initialization script runs. If it finds these environment variables:
   - It installs and registers the adapter.
   - It creates the `system.adapter.ecovacs-deebot.0` instance.
   - It automatically injects the credentials via `iobroker object extend`.
   - The ioBroker `js-controller` automatically encrypts the password using the system secret because the field is marked as `encryptedNative` in `io-package.json`.
   - It enables and starts the adapter instance.

---

## Supported Devices & Support Tiers

Support is divided into three tiers:

| Tier | Description | Devices (examples) |
| :--- | :--- | :--- |
| 🟢 **Active** | Devices owned by the maintainer – fully tested | OZMO 920/950, T8 AIVI, X1 TURBO, AIRBOT Z1, Z1 Air Quality Monitor |
| 🟡 **Community** | Best-effort – supported via Pull Requests | T9, T10, T20, T30, T50, T80, T90, X2, X5, X8, X9, X11, N-series, U2, yeedi |
| 🟡 **Community (partial)** | GOAT devices may partially work but are not actively maintained | GOAT G1, GX-600, A/O-series |
| 🔴 **Legacy** | XMPP/XML devices – **not supported in v2.x** | OZMO 930, Deebot 900/901, N79, 600-series, OZMO 610/960 |

> Legacy support is available only in adapter **v1.5.x** with library **v0.9.6**.

### Device Categories

The library recognises the following device categories returned by `vacbot.getDeviceCategory()`:

- `Vacuum Cleaner` – Standard robot vacuums (DEEBOT, yeedi series)
- `Air Purifier` – AIRBOT Z1
- `Air Quality Monitor` – Z1 Air Quality Monitor
- `Lawn Mower` – GOAT G1, GX-600, A/O-series *(community-supported only; may partially work)*

### Platform Types

Each device belongs to a platform architecture returned by `vacbot.getPlatformType()`:

| Value | Devices |
| :--- | :--- |
| `950` | OZMO 920 / OZMO 950 (first MQTT/JSON generation) |
| `U2` | U2, U2 PRO, N7 |
| `mini` | DEEBOT MINI, mini PRO, NEO 3.0 |
| `N8` | N8, N8 PRO, N8+, N9+, NEO |
| `T8` | T8, T8 AIVI, OZMO T8 series |
| `T9` | T9, T9 AIVI, T9+ |
| `T10` | T10, N10, N20, N20 PRO, TEO+, NEO+ |
| `T20` | T20, T30, T50, T80, T90, N30, N50, TEO OMNI |
| `X1` | X1, X1 OMNI, X1 TURBO, X1e OMNI |
| `X2` | X2, X5, X8, X9, X11 OmniCyclone |
| `airbot` | AIRBOT Z1 |
| `aqMonitor` | Z1 Air Quality Monitor |
| `lawnMower` | GOAT G1, GX-600, A/O series *(community-supported only; may partially work)* |
| `yeedi` | yeedi vac, mop station, Floor 3, cube |
| `legacy` | Pre-950 XMPP/XML devices (not supported in v2) |
| `unknown` | Unrecognised device class |

---

## ioBroker State Tree

Each device gets its own sub-tree under the adapter namespace. The device root ID is derived from the device's serial number / account identifier.

### `info.*` — Device Information

| State | Type | Description |
| :--- | :--- | :--- |
| `info.version` | string | Adapter version |
| `info.library.version` | string | Library version |
| `info.library.communicationProtocol` | string | `MQTT` or `XMPP` |
| `info.library.deviceIs950type` | boolean | True if the device uses the 950/MQTT/JSON stack |
| `info.library.debugMessage` | string | Debug messages from the library |
| `info.deviceName` | string | Device nickname |
| `info.deviceClass` | string | 6-character device class ID |
| `info.deviceModel` | string | Marketing model name |
| `info.platformType` | string | Platform architecture (see table above) |
| `info.deviceCategory` | string | Human-readable category |
| `info.smartType` | string | Internal Ecovacs IoT platform identifier |
| `info.connection` | boolean | Whether the device is currently connected |
| `info.error` | string | Last error message reported by the device |
| `info.errorCode` | string | Last error code |
| `info.battery` | number | Battery level (0–100 %) |
| `info.networkIP` | string | Device Wi-Fi IP address |
| `info.networkMAC` | string | Device MAC address |
| `info.networkSSID` | string | Connected Wi-Fi SSID |
| `info.networkSignal` | number | Wi-Fi signal strength (dBm) |
| `info.fwVer` | string | Firmware version |

### `verification.*` — Device Verification (login code 1013)

These account-level states (directly under the adapter namespace, not per device) drive the device-verification flow Ecovacs requires when it does not recognise the client device ID. When login fails with this requirement, the adapter marks itself disconnected, requests an e-mailed code and waits — there is no console prompt, so the code is entered through these states.

| State | Type | Description |
| :--- | :--- | :--- |
| `verification.status` | string (read-only) | `idle`, `required`, `code_sent`, `invalid_code`, `verified` or `error` |
| `verification.code` | string (writable) | Paste the code from the verification e-mail here |
| `verification.submit` | button (writable) | Set to `true` to confirm the code in `verification.code` |
| `verification.requestCode` | button (writable) | Set to `true` to re-request a fresh code by e-mail |

Flow: when `verification.status` becomes `code_sent`, enter the e-mailed code in `verification.code` and trigger `verification.submit`. On success the login completes automatically (`status` → `verified`) and the code state is cleared. An invalid/expired code sets `status` → `invalid_code`; correct it and submit again, or use `verification.requestCode` for a new code. The client device ID is persisted in `info.deviceId` so a verified host does not have to repeat this on every restart (a Docker rebuild that changes the machine ID would otherwise re-trigger verification). Set `clientDeviceId` in the instance config to pin/reset it manually.

### `status.*` — Operational Status

| State | Type | Description |
| :--- | :--- | :--- |
| `status.cleanStatus` | string | Current cleaning state: `auto`, `spot`, `stop`, `pause`, `charge`, etc. |
| `status.chargeStatus` | string | Charging state: `charging`, `returning`, `idle`, `completed` |
| `status.batteryIsLow` | boolean | Battery critically low |
| `status.cleanSpeed` | number | Suction level (1 = Quiet … 4 = MAX+) |
| `status.waterLevel` | number | Water flow level (1 = Low … 4 = Ultrahigh) |
| `status.waterBoxInstalled` | boolean | Whether the water box is attached |
| `status.sleepStatus` | boolean | Sleep / standby mode active |
| `status.dstatus` | string | Station state (idle, washing, drying, …) |
| `status.relocationStatus` | string | Relocalisation state: `ok`, `required`, `relocating` |

### `control.*` — Commands (writable states)

Writable states that trigger robot actions when set:

| State | Type | Description |
| :--- | :--- | :--- |
| `control.clean` | boolean | Start / stop auto cleaning |
| `control.charge` | boolean | Send robot to charging station |
| `control.stop` | boolean | Stop current activity |
| `control.pause` | boolean | Pause / resume |
| `control.spotArea` | string | Comma-separated list of room IDs to clean |
| `control.customArea` | string | Bounding-box coordinates (`x1,y1,x2,y2`) |
| `control.cleanSpeed` | number | Set suction level (1–4) |
| `control.waterLevel` | number | Set water flow level (1–4) |
| `control.volume` | number | Set speaker volume (0–10) |
| `control.playSound` | boolean | Trigger find-me chime |
| `control.relocate` | boolean | Trigger manual relocalisation |
| `control.autoEmpty` | boolean | Enable / disable auto-empty station |
| `control.emptyDustBin` | boolean | Manually trigger dustbin suction |
| `control.washingStart` | boolean | Start mop pad washing |
| `control.airDryingStart` | boolean | Start mop pad air drying |

### `map.*` — Map Data

| State | Type | Description |
| :--- | :--- | :--- |
| `map.currentMapMID` | string | Active map ID |
| `map.currentMapName` | string | Active map name |
| `map.deebotPositionX` / `Y` | number | Robot X/Y coordinates |
| `map.deebotPositionCurrentSpotAreaID` | string | Current room the robot is in |
| `map.chargePositionX` / `Y` | number | Charging station coordinates |
| `map.mapImage` | string | Base64 PNG of current map |

### `consumable.*` — Maintenance

| State | Type | Description |
| :--- | :--- | :--- |
| `consumable.filter` | number | Filter remaining life (%) |
| `consumable.main_brush` | number | Main brush remaining life (%) |
| `consumable.side_brush` | number | Side brush remaining life (%) |
| `consumable.unit_care` | number | Unit-care component remaining life (%) |

### `cleanLog.*` — History

| State | Type | Description |
| :--- | :--- | :--- |
| `cleanLog.last.timestamp` | number | Unix timestamp of the last clean |
| `cleanLog.last.squareMeters` | number | Area cleaned (m²) |
| `cleanLog.last.totalTime` | number | Duration (seconds) |
| `cleanLog.last.imageUrl` | string | URL of the cleaning map image |

---

## How Commands Work

### Command Flow

```
ioBroker state write
  → onStateChange() in main.js
    → adapterCommands.js dispatches to DeviceContext
      → adapterQueue.js (per-device FIFO + global rate limit)
        → vacbot.run() / vacbot.runAsync()
          → MQTT JSON command sent to device
```

### Rate Limiting

A global `RequestThrottle` allows **max 10 requests per 30-second window** across all devices to avoid API bans. Each device also maintains its own command queue (`adapterQueue.js`) that serialises outgoing commands.

### Command Registry (`lib/commandRegistry.js`)

The adapter's command registry maps state paths to library command strings. The library itself maintains a separate command registry that maps command strings to MQTT payloads and expected response events.

Key command groups:

| Group | Example commands |
| :--- | :--- |
| **Basic cleaning** | `Clean`, `Clean_V2`, `SpotArea`, `CustomArea`, `Stop`, `Pause`, `Resume`, `Charge` |
| **Configuration** | `SetCleanSpeed`, `SetWaterLevel`, `SetVolume`, `SetAutoEmpty` |
| **Station** | `EmptyDustBin`, `WashingStart`, `WashingStop`, `AirDryingStart`, `AirDryingStop` |
| **Map** | `GetMaps`, `GetSpotAreas`, `GetSpotAreaInfo`, `GetVirtualBoundaries`, `AddVirtualBoundary`, `DeleteVirtualBoundary` |
| **Consumables** | `GetLifeSpan`, `ResetLifeSpan` |
| **Info** | `GetBatteryState`, `GetCleanState`, `GetChargeState`, `GetError`, `GetNetInfo` |
| **AI / Sensors** | `SetTrueDetect`, `EnableAIVI`, `DisableAIVI` |
| **DND / Schedule** | `EnableDoNotDisturb`, `DisableDoNotDisturb`, `GetSchedule` |
| **AIRBOT** | `GetAirQuality`, `SetUVCleaner`, `SetHumidifierLevel`, `SetFreshenerLevel` |
| **Movement** | `MoveForward`, `MoveBackward` |

---

## Events

The library exposes events via a standard Node.js `EventEmitter`. The adapter maps these events to ioBroker state updates inside `lib/eventHandlers.js`.

### Core Status Events

| Event | Payload | Description |
| :--- | :--- | :--- |
| `BatteryInfo` | `number` | Battery level 0–100 |
| `BatteryIsLow` | `boolean` | Critically low battery |
| `ChargeState` | `string` | `charging`, `returning`, `idle`, `completed` |
| `CleanReport` | `string` | `auto`, `spot`, `stop`, `pause`, `edge` |
| `WorkState` | `{robot, station, paused}` | Combined work state |
| `SleepStatus` | `boolean` | Sleep/standby mode |
| `RelocationState` | `string` | `ok`, `required`, `relocating` |
| `Error` | `string` | Human-readable error message |
| `ErrorCode` | `string` | Raw error code (e.g. `"104"`) |

### Cleaning Configuration Events

| Event | Payload | Description |
| :--- | :--- | :--- |
| `CleanSpeed` | `number` | Current suction level |
| `WaterLevel` | `number` | Current water flow level |
| `WaterBoxInfo` | `number` | Water box present/absent |
| `CarpetPressure` | `boolean` | Auto-boost on carpets |
| `MopOnlyMode` | `boolean\|null` | Mop-only cleaning mode |
| `BorderSpin` | `boolean\|null` | Edge mopping spin enabled |
| `CurrentSpotAreas` | `string` | Room IDs being cleaned |
| `CurrentCustomAreaValues` | `string` | Current custom-area coordinates |

### Map & Position Events

| Event | Payload | Description |
| :--- | :--- | :--- |
| `Position` | `{x, y, a, coords, spotAreaID, spotAreaName, distanceToChargingStation}` | Robot position |
| `ChargingPosition` | `{x, y, a, coords}` | Dock position |
| `Maps` | `array` | List of saved maps |
| `MapSpotAreas` | `object` | Rooms on a map |
| `MapVirtualBoundaries` | `object` | Virtual walls and no-mop zones |
| `MapImageData` | `{mapID, mapType, mapBase64PNG}` | Rendered map image |

### Station & Consumable Events

| Event | Payload | Description |
| :--- | :--- | :--- |
| `AutoEmptyStatus` | `{autoEmptyEnabled, stationStatus, stationActive, dustBagFull}` | Auto-empty state |
| `LifeSpan` | `{filter, side_brush, main_brush, …}` | All consumable wear % |
| `StationState` | `{type, state, isAirDrying, isSelfCleaning, isActive}` | Station dynamic state |
| `AirDryingState` | `string` | `airdrying` or `idle` |

### Statistics Events

| Event | Payload | Description |
| :--- | :--- | :--- |
| `CleanLog` | `array` | Historical cleaning records |
| `LastCleanLogs` | `{timestamp, squareMeters, totalTime, imageUrl}` | Latest cleaning summary |
| `CleanSum` | `{totalSquareMeters, totalSeconds, totalNumber}` | Lifetime totals |
| `CurrentStats` | `{cleanedArea, cleanedSeconds, cleanType}` | Real-time session stats |

### Connection Events

| Event | Description |
| :--- | :--- |
| `ready` | MQTT channel ready – robot is connected and can receive commands |
| `disconnect` | Library disconnected (after error or manual disconnect) |

---

## Model & Capability System

### Three-Layer Configuration

The library determines device capabilities from three files (`models.js`, `modelTypes.js`, `capabilityTypes.js`) merged in this priority order (later overrides earlier):

1. **ModelType defaults** (`modelTypes.js`) – base architecture properties
2. **Capability groups** (`capabilityTypes.js`) – applied left-to-right per the model's `capabilities` array
3. **Direct model properties** (`models.js`) – highest priority

### Key Capability Groups

| Capability | What it adds |
| :--- | :--- |
| `vacuumBase` | Main/side brushes, filter, voice reports |
| `navigationBase` | Spot areas, custom areas, map images |
| `suctionMaxPlus` | MAX_PLUS suction level (4 levels) |
| `moppingUltraHigh` | ULTRAHIGH water level |
| `OMNI` | All-in-one station: auto-empty + mop washing + air drying + rotating pads |
| `PLUS` | Dustbin suction station only (no mop maintenance) |
| `TURBO` | Rotating mop + drying dock, **no** auto-empty |

### Protocol Versions

- Models with `V2: true` use modern V2 commands (`getMapInfo_V2`, `clean_V2`, etc.)
- Older 950-generation models use legacy V1 commands

---

## Key Source Files

| File | Purpose |
| :--- | :--- |
| [main.js](main.js) | Adapter entry point, lifecycle, device discovery, state change handler |
| [lib/device.js](lib/device.js) | VacBot wrapper – connects to the library, handles reconnection |
| [lib/deviceContext.js](lib/deviceContext.js) | Per-device state cache and metadata |
| [lib/adapterObjects.js](lib/adapterObjects.js) | Creates / maintains the ioBroker object tree |
| [lib/adapterCommands.js](lib/adapterCommands.js) | Maps ioBroker state writes to library commands |
| [lib/adapterQueue.js](lib/adapterQueue.js) | Per-device FIFO command queue |
| [lib/commandRegistry.js](lib/commandRegistry.js) | Registry of adapter-level command mappings |
| [lib/eventHandlers.js](lib/eventHandlers.js) | Maps library events to ioBroker state updates |
| [lib/mapHelper.js](lib/mapHelper.js) | Map image rendering and coordinate helpers |
| [lib/mapObjects.js](lib/mapObjects.js) | Creates map-related ioBroker objects |
| [lib/models.js](lib/models.js) | Local model definitions (mirrors the library's model list) |
| [lib/constants.js](lib/constants.js) | Shared constant values |
| [lib/adapterHelper.js](lib/adapterHelper.js) | Utility functions for the adapter layer |
| [lib/requestThrottle.js](lib/requestThrottle.js) | Global rate limiter (max 10 req / 30 s) |
| [lib/tools.js](lib/tools.js) | General-purpose helpers |

---

## Development

### Running Tests

```bash
npm test              # unit + package tests
npm run test:coverage # with nyc coverage report
npm run lint          # ESLint
```

### Adding a New Model

1. Add the device class entry to the library's `models.js` with its `type` and `capabilities`.
2. If needed, add a new entry to `modelTypes.js` or `capabilityTypes.js`.
3. Add any new adapter states to `lib/adapterObjects.js`.
4. Map new library events to states in `lib/eventHandlers.js`.
5. Wire new commands in `lib/adapterCommands.js` and `lib/commandRegistry.js`.

### Migration from v1.x to v2.x

- **Single instance:** Delete all but one adapter instance before upgrading. The `deviceNumber` setting is gone.
- **Legacy devices:** Devices using XMPP/XML protocol (OZMO 930, Deebot 900, etc.) are no longer supported.
- **Config migration:** On first start, the adapter automatically migrates native config keys from the old dot-notation format.

---

## External References

- **Adapter repository:** https://github.com/mrbungle64/ioBroker.ecovacs-deebot
- **Library repository:** https://github.com/mrbungle64/ecovacs-deebot.js
- **ioBroker forum thread:** https://forum.iobroker.net/topic/25048
- **Adapter wiki (map setup):** https://github.com/mrbungle64/ioBroker.ecovacs-deebot/wiki
- **Bug reports:** https://github.com/mrbungle64/ioBroker.ecovacs-deebot/issues
