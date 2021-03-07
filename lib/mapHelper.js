const helper = require('./adapterHelper');

function isSubchannel(id) {
    if (isSpotAreasChannel(id) || isVirtualBoundariesChannel(id) || isSavedCustomAreasChannel(id)) {
        return true;
    }
    return false;
}

function isSpotAreasChannel(id) {
    if (id.includes('.spotAreas')) {
        return true;
    }
    return false;
}

function isVirtualBoundariesChannel(id) {
    if (id.includes('.virtualBoundaries')) {
        return true;
    }
    return false;
}

function isSavedCustomAreasChannel(id) {
    if (id.includes('.savedCustomAreas')) {
        return true;
    }
    return false;
}

function getAreaName_i18n(adapter, spotAreaName) {
    let languageCode = 'en';
    if (adapter.config.languageForSpotAreaNames) {
        languageCode = adapter.config.languageForSpotAreaNames;
    }
    return adapter.vacbot.getAreaName_i18n(spotAreaName, languageCode);
}

function positionIsInRectangleForPosition(x, y, positionForRectangle, areaSize = 500) {
    const positionArray = positionForRectangle.split(',');
    const x1 = parseInt(positionArray[0]) - areaSize;
    const y1 = parseInt(positionArray[1]) - areaSize;
    const x2 = parseInt(positionArray[0]) + areaSize;
    const y2 = parseInt(positionArray[1]) + areaSize;
    const positionValues = x1 + ',' + y1 + ',' + x2 + ',' + y2;
    return positionIsInAreaValueString(x, y, positionValues);
}

function positionIsInAreaValueString(x, y, areaValueString) {
    if (helper.areaValueStringIsValid(areaValueString)) {
        const areaArray = areaValueString.split(',');
        const x1 = parseInt(areaArray[0]);
        const y1 = parseInt(areaArray[1]);
        const x2 = parseInt(areaArray[2]);
        const y2 = parseInt(areaArray[3]);
        x = parseInt(x);
        y = parseInt(y);
        if ((x >= x1) && (y >= y1) && (x <= x2) && (y <= y2)) {
            return true;
        }
    }
    return false;
}

function getDistanceToChargeStation(deebotPosition, chargePosition) {
    const deebotPosX = deebotPosition.split(',')[0];
    const deebotPosY = deebotPosition.split(',')[1];
    const chargePosX = chargePosition.split(',')[0];
    const chargePosY = chargePosition.split(',')[1];
    const distance = getDistance(deebotPosX, deebotPosY, chargePosX, chargePosY);
    return (distance / 1000).toFixed(1);
}

function getDistance(x1, y1, x2, y2) {
    let xs = x2 - x1;
    let ys = y2 - y1;
    xs *= xs;
    ys *= ys;
    return Math.sqrt(xs + ys);
}

module.exports = {
    isSubchannel,
    isSpotAreasChannel,
    isVirtualBoundariesChannel,
    isSavedCustomAreasChannel,
    positionIsInAreaValueString,
    positionIsInRectangleForPosition,
    getDistanceToChargeStation,
    getAreaName_i18n
};
