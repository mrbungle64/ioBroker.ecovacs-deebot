![Logo](admin/ecovacs-deebot.png)
# Ecovacs Deebot adapter for ioBroker

This adapter uses the [ecovacs-deebot](https://github.com/mrbungle64/ecovacs-deebot.js) library.

## Models

### Works properly
* Deebot Ozmo 930

### Should work
* Deebot Slim 2
* Deebot N79T
* Deebot 601
* Deebot Ozmo 610

#### These models are unlikely to work
* Deebot 900
* Deebot Ozmo 900
* Deebot Ozmo 950

## Adapter Configuration

* Email and Password
* Country code (continent)
* Device number
* Max. auto retries if connection fails
* Time period for retry (seconds)

## Control

### Buttons

* charge
* clean
* edge
* playSound
* spot
* stop

### Area/zone cleaning

#### SpotArea

* comma-separated list of numbers starting by `0` (e.g. `1,3`) for areas to be cleaned.

#### CustomArea

* comma-separated list of exactly 4 position values for `x1,y1,x2,y2` (e.g. `-3975.000000,2280.000000,-1930.000000,4575.000000`)
    * position `0.000000,0.000000,0.000000,0.000000` the position of the charging station


## Changelog

### 0.3.1
* (mrbungle64) Feature release (alpha)
   * Implemented SpotArea command
   * Implemented CustomArea command
   * Implemented PlaySound command
   
### 0.3.0
* (mrbungle64) alpha release

### 0.2.0
* (mrbungle64) Pre-release (alpha)

### 0.1.0
* (mrbungle64) Initial release (pre-alpha)

### 0.0.1
* (mrbungle64) Initial development release

## Thanks and credits
* @joostth ([sucks.js](https://github.com/joostth/sucks.js))
* @wpietri ([sucks](https://github.com/wpietri/sucks))
* @bmartin5692 ([sucks](https://github.com/bmartin5692/sucks), [bumber](https://github.com/bmartin5692/bumper))
* @Ligio ([ozmo](https://github.com/Ligio/ozmo))

## License
MIT License

Copyright (c) 2019 Author <author@mail.com>

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
