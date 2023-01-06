/* eslint-disable quotes */
// @ts-nocheck
// eslint-disable-next-line no-unused-vars
/*global systemDictionary:true */
'use strict';

systemDictionary = {
    "email": {
        "en": "Email or Ecovacs ID",
        "de": "E-Mail oder Ecovacs-ID",
        "ru": "Электронная почта или идентификатор Ecovacs"
    },
    "password": {
        "en": "Password",
        "de": "Passwort",
        "ru": "Пароль"
    },
    "countrycode": {
        "en": "Country",
        "de": "Land",
        "ru": "Страна"
    },
    "deviceNumber": {
        "en": "Device number",
        "de": "Gerät Nr.",
        "ru": "Номер устройства"
    },
    "login": {
        "en": "Login",
        "de": "Anmeldung",
        "ru": "Авторизоваться"
    },
    "english": {
        "en": "English",
        "de": "Englisch",
        "ru": "английский"
    },
    "german": {
        "en": "German",
        "de": "Deutsch",
        "ru": "Немецкий"
    },
    "pre-selection": {
        "en": "pre-selection",
        "de": "Vorauswahl verwenden",
        "ru": "предварительный отбор"
    },
    "enable": {
        "en": "enable",
        "de": "aktivieren",
        "ru": "включить"
    },
    "disable": {
        "en": "disabled",
        "de": "deaktivieren",
        "ru": "запрещать"
    },
    "areas": {
        "en": "areas",
        "de": "Bereiche",
        "ru": "области"
    },
    "mainPage": {
        "en": "Main page",
        "de": "Hauptseite",
        "ru": "Главная страница"
    },
    "extendedFunctions": {
        "en": "Extended",
        "de": "Erweitert",
        "ru": "расширенный"
    },
    "feature.info.dustbox": {
        "en": "Create state for the dust box status (\"info.dustbox\")",
        "de": "Erstelle Datenpunkt für den Status vom Staubbehälter (\"info.dustbox\")",
        "ru": "Отображение статуса пылесборника (\"info.dustbox\")"
    },
    "feature.control.move": {
        "en": "Create states for move commands (\"control.move\")",
        "de": "Erstelle Datenpunkte für manuelle Steuerungsbefehle (\"control.move\")",
        "ru": "Создание состояний для команд перемещения (\"control.move\")"
    },
    "feature.map.virtualBoundaries": {
        "en": "Create states for virtual boundaries and no mop zones",
        "de": "Erstelle Datenpunkte für virtuelle Begrenzungen und No-Mop-Zones",
        "ru": "Создавайте состояния для виртуальных границ"
    },
    "feature.map.virtualBoundaries.write": {
        "en": "Delete, save and recreate saved virtual boundaries and no mop zones",
        "de": "Löschen, Speichern und Wiederherstellen von gespeicherten virtuellen Begrenzungen und No-Mop-Zones",
        "ru": "Удалить, сохранить и воссоздать сохраненные виртуальные границы"
    },
    "featuresWarning": {
        "en": "Warning: Unlocking of functions is at your own risk. The implementation of functions varies from model to model and some functions are not available in every model",
        "de": "Warnung: Das Freischalten von Funktionen geschieht auf eigene Gefahr. Die Implementierungen von Funktionen sind von Modell zu Modell unterschiedlich und einige Funktionen sind nicht bei jedem Modell verfügbar",
        "ru": "Предупреждение: Вы можете разблокировать функции на свой страх и риск. Реализация функций варьируется от модели к модели, и некоторые функции доступны не в каждой модели"
    },
    "feature.pauseBeforeDockingChargingStation.areasize": {
        "en": "Size of the area to detect the area in front of the charging station (\"control.extended.pauseBeforeDocking[...]\")",
        "de": "Größe des Bereichs zur Erkennung des Bereichs vor der Ladestation (\"control.extended.pauseBeforeDocking[...]\")",
        "ru": "Размер области для обнаружения области перед зарядной станцией (\"control.extended.pauseBeforeDocking[...]\")"
    },
    "feature.pauseBeforeDockingChargingStation.pauseOrStop": {
        "en": "Send \"pause\" or \"stop\" (\"control.extended.pauseBeforeDocking[...]\")",
        "de": "\"Pause\" oder \"Stop\" senden (\"control.extended.pauseBeforeDocking[...]\")",
        "ru": "Отправить \"пауза\" или \"стоп\" (\"control.extended.pauseBeforeDocking[...]\")"
    },
    "feature.control.spotAreaSync": {
        "en": "Synchronize spotArea buttons in the \"control\" channel and also the labels",
        "de": "\"spotArea\" Buttons im \"control\" Kanal und die Beschriftung der Bereiche synchronisieren",
        "ru": "Синхронизируйте кнопки spotArea в \"control\" канале, а также ярлыки"
    },
    "feature.map.spotAreas.cleanSpeed": {
        "en": "Option to control clean speed separately for each spot area",
        "de": "Option zur separaten Steuerung der Reinigungsstärke für die einzelnen Bereiche",
        "ru": "Возможность управления скоростью уборки отдельно для каждой области пятна"
    },
    "feature.map.spotAreas.waterLevel": {
        "en": "Option to control water level separately for each spot area",
        "de": "Option zur separaten Steuerung der Wasserzufuhr-Stärke für die einzelnen Bereiche",
        "ru": "Возможность контролировать уровень воды отдельно для каждого участка"
    },
    "feature.map.mapImage": {
        "en": "Function to load a static map (\"map.[mapID].loadMapImage\")",
        "de": "Funktion zum Laden einer statischen Map (\"map.[mapID].loadMapImage\")",
        "ru": "Функция для загрузки статической карты (\"map.[mapID].loadMapImage\")"
    },
    "feature.control.experimental": {
        "en": "Some further experimental features (\"control.extended\" channel)",
        "de": "Einige weitere experimentelle Features (\"control.extended\" Kanal)",
        "ru": "Некоторые дополнительные экспериментальные функции (\"control.extended\" канал)"
    },
    "feature.control.v2commands": {
        "en": "Use V2 clean commands for newer models (e.g. T8/T9/N8/X1 series)",
        "de": "V2 clean Befehle für neuere Modelle nutzen (z.B. T8/T9/N8/X1 Serie)",
        "ru": "Используйте команду V2 Clean для новых моделей"
    },
    "feature.control.nativeGoToPosition": {
        "en": "Use native \"goToPosition\" function (e.g. T8/T9/N8/X1 series)",
        "de": "Native \"goToPosition\" Funktion benutzen (z.B. T8/T9/N8/X1 Serie)",
        "ru": "Используйте встроенную функцию \"goToPosition\""
    },
    "feature.control.autoEmptyStation": {
        "en": "Create states for the auto empty station",
        "de": "Erstelle Datenpunkte für die Automatische Absaugstation",
        "ru": "Некоторые функции самоопорожняющейся станции"
    },
    "feature.control.autoBoostSuction": {
        "en": "Create state for auto-boost suction (\"control.extended.autoBoostSuction\")",
        "de": "Erstelle Datenpunkt für die Auto-Saugkraftverstärkung (\"control.extended.autoBoostSuction\")",
        "ru": "Автоматическое усиление всасывания (\"control.extended.autoBoostSuction\")"
    },
    "feature.map.spotAreas.lastTimePresence.threshold": {
        "en": "Threshold for last time presence feature (seconds)",
        "de": "Schwellenwert für die \"Letzte Anwesenheit\" Funktion (Sekunden)",
        "ru": "Порог для функции последнего времени присутствия (секунды)"
    },
    "languageForSpotAreaNames": {
        "en": "Language for spot area labels (only if labels are supported by the model)",
        "de": "Sprache für die Beschriftung der Bereiche (nur wenn Labels vom Modell unterstützt werden)",
        "ru": "Язык меток областей пятна"
    },
    "feature.control.spotAreaKeepModifiedNames": {
        "en": "Keep modified names (\"spotAreaName\") of the \"spotAreas\" channels",
        "de": "Manuell geänderte Namen (\"spotAreaName\") in den \"spotAreas\" channels beibehalten",
        "ru": "Больше не меняйте измененные \"spotAreaName\" в каналах \"spotAreas\""
    },
    "feature.cleaninglog.downloadLastCleaningMapImage": {
        "en": "Automatic download of the last cleaning image",
        "de": "Automatisches Herunterladen vom Image der letzten Reinigung",
        "ru": "Автоматическая загрузка последнего образа очистки"
    },
    "enableKeepLatest": {
        "en": "enable download and keep the latest map image",
        "de": "aktivieren und die aktuellste Karte als Datei behalten",
        "ru": "Включить загрузку и сохранить последнюю карту в виде файла"
    },
    "enableKeepAll": {
        "en": "enable download and keep all map images",
        "de": "aktivieren und alle Karten als Datei behalten",
        "ru": "Включить загрузку и сохранить все карты в виде файла"
    },
    "doNotSynchronize": {
        "en": "do not synchronize",
        "de": "nicht synchronisieren",
        "ru": "Не синхронизировать"
    },
    "onlyCreate": {
        "en": "only create new ones",
        "de": "nur neue erstellen",
        "ru": "Создавайте только новые"
    },
    "fullSynchronization": {
        "en": "full synchronization",
        "de": "voll synchronisieren",
        "ru": "Полная синхронизация"
    },
    "pollingInterval": {
        "en": "Polling interval (seconds)",
        "de": "Abfrage-Intervall (Sekunden)",
        "ru": "Интервал опроса (секунды)"
    },
    "pause": {
        "en": "pause",
        "de": "Pause",
        "ru": "пауза"
    },
    "stop": {
        "en": "stop",
        "de": "Stop",
        "ru": "стоп"
    }
};
