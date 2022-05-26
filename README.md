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
* Set individual spot area names

Please note: Some features are only available for some models and some are still experimental

## Models

### Supported models

* Deebot 900/901
* Deebot OZMO 930
* Deebot OZMO 920/950
* Deebot OZMO T8 AIVI

The models listed are those that I have in use myself or which are technically identical to these.

### These models should work properly or at least partially

* Deebot Slim 2
* Deebot N79 series
* Deebot M88
* Deebot 500
* Deebot 600/601/605
* Deebot 710/711
* Deebot OZMO 610
* Deebot OZMO 900/905
* Deebot OZMO Slim 10/11
* Deebot OZMO T5
* Deebot OZMO T10 Plus
* Deebot U2 series
* Deebot N8 series
* Deebot (OZMO) T8 series
* Deebot T9 series
* Deebot T10 series
* Deebot X1 series

The models listed are either already known to work or are technically similar to these models.
Nevertheless, the functionality may be partially limited.

I try to achieve a wide range of functionality, 
but decide this case by case depending on complexity and various other criteria.
There is of course no claim to full functionality.

## Installation

### Prerequisites

To use this adapter, you will need to already have [ioBroker](iobroker.net) installed. 

It is recommended to use version 14.x or 16.x of [Node.js](nodejs.org).
The minimum required version is 12.x, but support for this version may will be dropped soon.

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
sudo npm install canvas --unsafe-perm=true
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
* For some models (e.g. Deebot OZMO 930) it is recommended
  to [schedule a restart](https://www.iobroker.net/#en/documentation/admin/instances.md#The%20page%20content) once a day
  because there are some reports that the connection is lost after approx. 24 hours
* The "edge" function does not work with Deebot U2 (starts auto clean instead)
* The "move" functions do not work with Deebot OZMO T8 AIVI (and maybe also for some other models)
* Some "cleaninglog" states are empty on T9 series ("last20Logs", "lastCleaningDate" and "lastCleaningMapImageURL")

## Changelog

### 1.4.4 (alpha)
* Bumped ecovacs-deebot.js to 0.8.2
* Some improvements and some fixes

### 1.4.3
* Bumped ecovacs-deebot.js to latest beta
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

### 1.3.4
* Bumped ecovacs-deebot.js to 0.7.2 (beta)
* Implemented some experimental functions for auto empty stations
* Some refactoring

### 1.3.3
* Bumped ecovacs-deebot.js to 0.7.1 (incl. fix for CVE-2022-0155)

### 1.3.2
* Bumped follow-redirects to 1.14.7 (fix for CVE-2022-0155) and some other dependencies
* Added N8 PRO+

### 1.3.1
* Fix the cleaning functions for the Deebot 710 series

### 1.3.0
* Using library version 0.7.0 (beta)
* The minimum required version of Node.js is now 12.x
* Some improvements for newer models (e.g. T9 series)
* Some other improvements and fixes

### 1.2.4
* Using library version 0.6.8
* Some optimizations
* Preparations for changing the minimum required Node.js version to 12.x

### 1.2.3
* Using library version 0.6.6
* Lots of code refactoring, optimizations and some fixes

### 1.2.2
* Added function to load current map image (non 950 type models, e.g. OZMO 930, Deebot 901)

### 1.2.1
* Some enhancements and fixes
* (benep) Added state to play sound by id

### 1.2.0
* Using library version 0.6.1
* Added functions for deleting, saving and recreating saved virtual boundaries (950 type models, e.g. OZMO 920/950, T8 series)
* Added functions for saving and recreating sets of virtual boundaries (950 type models, e.g. OZMO 920/950, T8 series)
* Added options to control clean speed and water level separately for each spot area
* Added function to save current spot area values
* Added function to load current map image (950 type models, e.g. OZMO 920/950, T8 series)
* Added some cleaning log values and some states for current cleaning stats
* Removed "Use alternative API call for lastCleaningMapImageURL and lastCleaningTimestamp" option
* Moved some states from "info" channel to sub channels "info.library" and "info.network"
* Quite a lot of improvements for processing map data, spot areas and virtual boundaries
* Some optimisations for js-controller 3.3
* Improved support for N8 series
* Initial support for T9 series
* Some improvements and fixes

### 1.1.1
* Using library version 0.6.0
  * Updated login process
  * Support for Chinese server login
* Initial support for some models (e.g. N3, N7 and N8 series)

### 1.1.0
* Stable release

### 1.0.13
* Using library version 0.5.6
* Some improvements and fixes

### 1.0.12
* Using library version 0.5.5
* Added some more T8 models
* Several improvements and fixes

### 1.0.11
* Enabled some features for OZMO 900
* Several minor improvements

### 1.0.10
* Using library version 0.5.4
* Several improvements and fixes
* Added available spot area boundaries to "map" channel (read only)

### 1.0.9
* Using library version 0.5.3
* Added some experimental features (for a few models only)
* Added option for virtual boundaries and some further improvements to adapter config
* Some improvements for js-controller 3.2.x

### 1.0.8
* Using library version 0.5.2
* Added available virtualBoundaries channel for Deebot 900/901 and Ozmo 930 (read only)
* Added "volume" and buttons for resetting consumable values for 950 type models (920/950/T8)
* Improved synchronization of spot area buttons
* Add option for setting the language for spot area names
* Added some experimental features (for a few models only)
* Several enhancements and fixes
* Bump some dependencies

### 1.0.7
* Using library version 0.5.1
* Initial support for Deebot U2 series
* Improved support for Ozmo T8 models
* (boriswerner) Fixed cleaning log for 950 type models (920/950/T8)
* (boriswerner) Added available virtualBoundaries to "map" channel (currently read only)
* Improved handling of device classes
* Several enhancements and fixes

### 1.0.6
* Using library version 0.5.0
* Fix for running multiple devices
* Support for additional Ozmo T8 models
* Add option to synchronize spotArea buttons
* Set state value for triggered buttons to false
* Add option to suppress "unknown" value for "map.deebotPositionCurrentSpotAreaID" state
* Further enhancements and fixes

### 1.0.5
* Bump library to 0.4.25
* Initial support for Ozmo T8 and T8+
* Implement buttons for resetting consumable values (currently Deebot 900/901 and Ozmo 930 only)
* Several enhancements and fixes

### 1.0.4
* Bump library to 0.4.21
* Remove canvas from dependencies
* Several bugfixes and improvements (especially for N79 series)
* Possibility to specify the number of reruns for a spot area
* Spot areas in the "control" channel are now created automatically
* Remove number of spot areas from adapter settings
* Some refactoring
* Bump dependencies

### 1.0.1 - 1.0.3
* Added support for Ozmo T8 AIVI
* Compact mode support
* Added a button to save the last used custom area values
* Added buttons to rerun saved custom areas
* Some enhancements and fixes

### 1.0.0
* Stable release

### 0.0.1 - 0.6.5
* [Changelog archive](https://github.com/mrbungle64/ioBroker.ecovacs-deebot/wiki/Changelog-(archive)#059)

## Disclaimer

I am in no way affiliated with ECOVACS.

## License

MIT License

Copyright (c) 2022 Sascha Hölzel <mrb1232@posteo.de>

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
