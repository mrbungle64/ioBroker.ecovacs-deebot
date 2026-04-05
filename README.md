![Logo](admin/ecovacs-deebot.png)

# Ecovacs Deebot adapter for ioBroker

![Stable version](http://iobroker.live/badges/ecovacs-deebot-stable.svg)
[![Latest version](http://img.shields.io/npm/v/iobroker.ecovacs-deebot.svg)](https://www.npmjs.com/package/iobroker.ecovacs-deebot)
![Number of Installations](http://iobroker.live/badges/ecovacs-deebot-installed.svg)
[![Number of monthly downloads](https://img.shields.io/npm/dm/iobroker.ecovacs-deebot.svg)](https://www.npmjs.com/package/iobroker.ecovacs-deebot)
[![Number of downloads](https://img.shields.io/npm/dt/iobroker.ecovacs-deebot.svg)](https://www.npmjs.com/package/iobroker.ecovacs-deebot)
[![github-workflow](https://github.com/mrbungle64/iobroker.ecovacs-deebot/actions/workflows/node.js.yml/badge.svg)](https://github.com/mrbungle64/iobroker.ecovacs-deebot)

This adapter uses the [ecovacs-deebot.js](https://github.com/mrbungle64/ecovacs-deebot.js) library.

> **⚠️ Maintenance Status: Community-Driven Project**
> This adapter is now following a **Community-Driven** maintenance model. The maintainer focuses on the core engine and personally owned devices. Support for all other models depends entirely on community contributions (Pull Requests).

## 🗺️ Roadmap & Strategy

To ensure long-term maintainability, we are streamlining the adapter's architecture:

1. **Phase 1: Final Legacy Support (Adapter v1.5.x / Library v0.9.6)**
   * This is the final "safe harbor" for all legacy devices using XML protocols (XMPP/XML or MQTT/XML).
   * No new legacy features will be added.

2. **Phase 2: Modernization (Adapter v2.0.x / Library v1.0.0)**
   * Transition to a **Pure MQTT/JSON** stack.
   * Complete removal of legacy code to improve performance and stability.
   * **Breaking Change:** Legacy models (e.g., OZMO 930, Deebot 900) will no longer be supported in v2.x.

## Models & Support Tiers

Support is divided into tiers based on device availability for the maintainer:

| **Tier** | **Status** | **Logic** |
| :--- | :--- | :--- |
| 🟢 **Active** | Fully Supported | Devices owned by the maintainer. Bugfixes and features are tested personally. |
| 🟡 **Community** | Best Effort | Modern MQTT/JSON devices. Supported via community Pull Requests. |
| 🔴 **Legacy** | Maintenance Only | XML-based devices. Supported **only** in Adapter v1.5.x / Library v0.9.6. |

### How to get your model supported?

If you own a modern (MQTT/JSON) model that is currently not supported:

1. Check the [ecovacs-deebot.js](https://github.com/mrbungle64/ecovacs-deebot.js) library.
2. Provide a **Pull Request** with the necessary model definitions.
3. **Requests for new models without a Pull Request will be closed.**

## Features (Overview)

* **Cleaning:** Auto, Area, Custom Area, Spot.
* **Information:** Battery, Consumables, Cleaning Logs, Maps.
* **Settings:** Water level, Vacuum power, Do-not-disturb, AIVI settings.
* **Advanced:** Virtual boundaries, No-mop-zones, Silent approach (model dependent).

## Installation & Prerequisites

* **Node.js:** >= 20.x
* **ioBroker:** Stable installation
* **Optional:** `canvas` for map rendering (see [Wiki](https://github.com/mrbungle64/ioBroker.ecovacs-deebot/wiki) for details).

## Disclaimer

I am in no way affiliated with Ecovacs Robotics Co., Ltd. or yeedi Technology Limited. This is a private hobby project.

## License

MIT License - Copyright (c) 2026 Sascha Hölzel
