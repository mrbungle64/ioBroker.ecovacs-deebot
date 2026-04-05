![Logo](admin/ecovacs-deebot.png)

# Ecovacs Deebot adapter for ioBroker

![Stable version](http://iobroker.live/badges/ecovacs-deebot-stable.svg)
[![Latest version](http://img.shields.io/npm/v/iobroker.ecovacs-deebot.svg)](https://www.npmjs.com/package/iobroker.ecovacs-deebot)
![Number of Installations](http://iobroker.live/badges/ecovacs-deebot-installed.svg)
[![Number of monthly downloads](https://img.shields.io/npm/dm/iobroker.ecovacs-deebot.svg)](https://www.npmjs.com/package/iobroker.ecovacs-deebot)
[![Number of downloads](https://img.shields.io/npm/dt/iobroker.ecovacs-deebot.svg)](https://www.npmjs.com/package/iobroker.ecovacs-deebot)
[![github-workflow](https://github.com/mrbungle64/iobroker.ecovacs-deebot/actions/workflows/node.js.yml/badge.svg)](https://github.com/mrbungle64/iobroker.ecovacs-deebot)

This adapter uses the [ecovacs-deebot.js](https://github.com/mrbungle64/ecovacs-deebot.js) library.

## Features

### Basic Features

* Cleaning functions (e.g., auto, area and custom area cleaning) and various other basic functions (e.g., play sound, reset consumables, relocate position)
* Retrieve information (e.g., battery level, cleaning log, consumables status, cleaning and charging status) and various other extended information (e.g., charging position, map-related information)
* Set vacuum power, water level, and other basic adjustments along with various extended settings (e.g., continuous cleaning, do-not-disturb mode, volume, AIVI/TrueDetect 3D)
* Retrieve information of the maps including areas, virtual boundaries, and no-mop-zones, also during the cleaning process (e.g., current position and area)
* Loading the current map image

### Extended Features (ioBroker adapter only)

* Save and recreate full sets of virtual boundaries and no-mop-zones
* Information about the date and time of the last presence for each single area
* Some functionality when returning to the charging station or entering/leaving area
* Save the last used custom area and rerun the saved areas
* Silent approach cleaning and go-to-position functions
* Set individual area names

### Important Notes

* Some features (e.g., "Silent approach") are only available for some models (mostly current models)
* and some are still experimental (e.g., "Loading the current map image", handle sets of virtual boundaries)
* The functionality of the adapter is not guaranteed for all models (see below)

## Models

### Supported models

The following models I own myself, so they are very widely supported:

* Deebot OZMO 920/950
* Deebot OZMO T8 AIVI
* Deebot X1 Turbo
* Airbot Z1

### Other models

The following models should work properly or at least partially.
They are either already known to work or are technically similar to these models.
Nevertheless, the functionality may be partially limited.

I try to achieve a wide range of functionality, but decide this case by case depending on complexity and various other criteria.
There is of course no claim to full functionality.

#### Ecovacs Deebot

* Deebot N8 series
* Deebot T8 series
* Deebot T9 series
* Deebot T10 series
* Deebot T20 series
* Deebot X1 series
* Deebot X2 series

#### yeedi

* yeedi k650
* yeedi 2 hybrid
* yeedi vac hybrid
* yeedi vac max
* yeedi vac 2 pro
* yeedi mop station

**Note**: All these lists may not be fully complete

### Legacy models (soon to be discontinued)

Legacy models that use XML for data transport (e.g. Deebot OZMO 930, Deebot 900/901) are mostly still working, 
but support for these models will be discontinued sooner or later.

Please check [this readme](https://github.com/mrbungle64/ecovacs-deebot.js#legacy-models-soon-to-be-discontinued) for more information.

## Installation

### Prerequisites

To use this adapter, you will need to already have [ioBroker](iobroker.net) installed. 

The minimum required version of Node.js is 20.x.

### Optional prerequisites

This adapter uses the [node-canvas](https://www.npmjs.com/package/canvas) library for some map-related functionality
which may require the installation of some additional packages.

The installation of canvas is optional and not necessary for models without map functionality, 
but for full functional range please install the following packages.

For Debian-based Linux systems the following commands should be executed:
```bash
sudo apt-get update
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

A reboot might be necessary before executing the next command
```bash
npm install canvas --unsafe-perm=true
```

For instructions for other systems visit https://www.npmjs.com/package/canvas#compiling

## FAQ

Frequently asked questions can be found [here](https://github.com/mrbungle64/ioBroker.ecovacs-deebot/wiki/FAQ)

## Usage

Information on how to use this adapter can be found [here](https://github.com/mrbungle64/ioBroker.ecovacs-deebot/wiki)

### States

Information about the states can be found [here](https://github.com/mrbungle64/ioBroker.ecovacs-deebot/wiki/States-%28EN%29) (English) 
and [here](https://github.com/mrbungle64/ioBroker.ecovacs-deebot/wiki/Datenpunkte-%28DE%29) (German)

## Known issues

* The "move" function varies from model to model, so it's not implemented universally
* The generation of map images is not stable on 32-bit systems
* and it still does not work properly with the Deebot X1 series and other current models

## Changelog

### 1.4.16 (alpha)
- Breaking change: Bump minimum required version of Node.js to 20.x
- Add more states for air drying timer
- Use adapter-dev module
- Some further improvements and optimizations
* Bumped ecovacs-deebot.js to 0.9.6 (latest beta)
* Bumped several other dependencies
 
### 1.4.15 (latest stable)
- Breaking change: Bump minimum required version of Node.js to 18.x
- Bumped ecovacs-deebot.js to 0.9.6 (beta)
- Add state (button) for manually requesting the cleaning log
- Separate mopping and scrubbing mode
- Add states for air drying timer
- Some further improvements and optimizations

### 0.0.1 - 1.4.14
* [Changelog archive](https://github.com/mrbungle64/ioBroker.ecovacs-deebot/wiki/Changelog-(archive))

## Disclaimer

I am in no way affiliated with Ecovacs Robotics Co., Ltd. or yeedi Technology Limited.

## License

MIT License

Copyright (c) 2026 Sascha Hölzel <mrb1232@posteo.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
