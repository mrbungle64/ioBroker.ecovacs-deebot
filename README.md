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

Some noteworthy features are:

* Basic cleaning functions (e.g. auto clean, spot area, custom area)
* and various other commands (e.g. play sound, reset consumables, relocate position)
* Retrieve basic information (e.g. battery level, cleaning log, consumable, cleaning and charging status)
* and various extended information (e.g. charging position, map related information, network information)
* Retrieve information during the cleaning process (e.g. current position and current spot area)
* Set vacuum power, water level and other basic settings
* Set extended settings (e.g. continuous cleaning, do-not-disturb mode, volume, TrueDetect 3D)
* Save the last used custom area and rerun the saved areas
* Retrieve information of the maps incl. spot areas, virtual boundaries and no-mop-zones
* Delete, save and recreate single virtual boundaries as well as a full set of virtual boundaries
* Information about the date and time of the last presence for each single spot area
* Some functionality when returning to charging station or entering/leaving spot area
* Function for loading the current map image
* Set individual spot area names (in ioBroker)

Please note: Some features are only available for some models and some are still experimental

## Models

### Fully supported models

The fully supported models are those that I own myself:

* Deebot OZMO 920
* Deebot T8 AIVI

### Other supported models

These models should work properly or at least partially.
They are either already known to work or are technically similar to these models.
Nevertheless, the functionality may be partially limited.

I try to achieve a wide range of functionality, but decide this case by case depending on complexity and various other criteria.
There is of course no claim to full functionality.

#### Ecovacs Deebot

* Deebot OZMO 950/T5
* Deebot N8 series
* Deebot U2 series
* Deebot T8 series
* Deebot T9 series
* Deebot T10 series
* Deebot X1 series

#### yeedi (since version 1.4.5)

* yeedi k650
* yeedi 2 hybrid
* yeedi vac hybrid
* yeedi vac max
* yeedi mop station

#### Legacy models (soon to be discontinued)

These models use XML for data transport and also different characteristics for commands and events than the current models.
I also don't use my Slim 2, Deebot 901 and OZMO 930 anymore.

**Support for these models will therefore soon be discontinued**.

* Deebot Slim 2
* Deebot N79 series
* Deebot M88
* Deebot 500
* Deebot 600/601/605
* Deebot 710/711
* Deebot 900/901
* Deebot OZMO 610
* Deebot OZMO 900/905
* Deebot OZMO 930
* Deebot OZMO Slim 10/11

## Installation

### Prerequisites

To use this adapter, you will need to already have [ioBroker](iobroker.net) installed. 

The minimum required version of Node.js is 14.x. It is recommended to use version 14.x or 16.x

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

* The generation of map images is currently not stable on 32-bit systems
* The "edge" function does not work with Deebot U2 (starts auto clean instead)
* The "move" functions do not work with Deebot OZMO T8 AIVI (and maybe also for some other models)
* The generation of map images does not work properly with the Deebot X1 series

## Changelog

### 1.4.12 (alpha)
* Implemented 'Go to calculated center position' for spot areas (models with native goToPosition function)

### 1.4.11 (latest beta)
* Bumped ecovacs-deebot.js to 0.9.2 (alpha)
* Added channel for the auto empty station (incl. dust bag full)
* Added state for changing the scrubbing pattern (OZMO Pro)
* Added option to save the used go to position values
* Added function to also save the current deebot position as a 'go to position'
* Automatically set the last time dustbox removed when the dust bag has been emptied by the auto empty station
* Some further improvements and some fixes

### 1.4.10
* Bumped ecovacs-deebot.js to 0.9.1
* Added channel with information about the last cleaned spot area
* Implemented "mark for next spot area cleaning" function

### 1.4.9
* Bumped ecovacs-deebot.js to 0.9.1-beta.3
* Several improvements for T9 based models (e.g. N8/T9/T10/X1)
* Implemented option for automatic download of the last cleaning image
* The generated base64 map image will also be stored to the filesystem now
* Some further improvements and some fixes

### 1.4.8 (latest stable)
* Breaking change: Bumped minimum required version of Node.js to 14.x
* Bumped ecovacs-deebot.js to 0.9.0-beta.2
* Bumped several other dependencies

### 1.4.7
* Bumped ecovacs-deebot.js to 0.8.3-beta.2 (Hotfix XMPP devices)

### 1.4.6
* Added option for native goToPosition function (e.g. Deebot OZMO T8 AIVI)
* Some improvements and fixes

### 1.4.5
* Added states for time and cleaned area since last dustbox removal
* Added button for manually trigger dustbox removal
* Removed some options from settings
* Some other changes to settings
* Bumped ecovacs-deebot.js to the latest beta version
* Initial Support for yeedi login (experimental)
* and also for a few models (experimental)
  * yeedi k650
  * yeedi 2 hybrid
  * yeedi vac hybrid
  * yeedi mop station

### 1.4.4
* Bumped ecovacs-deebot.js to 0.8.2
* Bugfix for non 950 type models with mopping system (e.g. OZMO 930)
* Some minor improvements

### 1.4.3
* Bumped ecovacs-deebot.js to the latest beta version
* Improved last time presence functionality
* Added state for Clean Preference (e.g. T8/T9 series)
* Added state for the last 20 errors
* Added state for cleaning schedule (read-only)
* Some further improvements and some fixes

### 1.4.2
* Bumped ecovacs-deebot.js to 0.8.1 (beta)
* Added states for cleaning cloth reminder and auto-boost suction (e.g. OZMO 920/950, T8/T9 series)
* Added states for mopping type and scrubbing type (models with OZMO Pro mopping system)
* Added option to choose between 'pause' and 'stop' for 'PauseBeforeDockingChargingStation...' functionality
* Some further improvements

### 1.4.1
* Bumped ecovacs-deebot.js to 0.8.0
* Improved last time presence functionality
* Added option to reset the vacuum power (cleanSpeed) to standard on return
* Added option to keep modified spot area names (pre-selection on non 950 type models)
* Added states for current used custom and spot areas (currentUsedSpotAreas and customUsedCustomAreaValues)
* Handle error code 110 ("NoDustBox: Dust Bin Not installed")
* Bumped some dependencies

### 1.4.0
* Bumped ecovacs-deebot.js to 0.8.0 (beta)
* Implemented last time presence function (still experimental)
* Implemented cleanCount (permanent clean count) function (T8/T9/X1 series)
* Implemented trueDetect (enable/disable) function (T8/T9/X1 series)
* Added unit care to consumables (T8/T9/X1 series)
* Added Deebot X1 series
* Some improvements and fixes

### 0.0.1 - 1.3.4
* [Changelog archive](https://github.com/mrbungle64/ioBroker.ecovacs-deebot/wiki/Changelog-(archive))

## Disclaimer

I am in no way affiliated with Ecovacs Robotics Co., Ltd. or yeedi Technology Limited.

## License

MIT License

Copyright (c) 2023 Sascha Hölzel <mrb1232@posteo.de>

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
