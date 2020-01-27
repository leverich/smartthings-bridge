const https = require('https');
const AWS = require('aws-sdk');

exports.handler = async (event) => {
    try {
        return await handler(event);
    } catch (err) {
        console.log('error handling request:', err);
    }
};

async function handler(event) {
    console.log(`handling request; payload=${JSON.stringify(event)}`);

    let err = false;
    let resp = {};

    switch (event.lifecycle) {
        case 'PING':
            resp = {"pingData": {"challenge": event.pingData.challenge}};
            break;

        case 'CONFIGURATION':
            switch (event.configurationData.phase) {
                case 'INITIALIZE':
                    resp = {
                        "configurationData": {
                            "initialize": {
                                "id": "app",
                                "name": "SmartThings/HTTP+JSON Bridge",
                                "description": "SmartThings/HTTP+JSON Bridge",
                                "permissions": [
                                    "r:devices:*",
                                    "r:locations:*"
                                ],
                                "firstPageId": "1"
                            }
                        }
                    };
                    break;
                case 'PAGE':
                    resp = {
                        "configurationData": {
                            "page": {
                                "pageId": "1",
                                "name": "Configuration",
                                "complete": true,
                                "sections": [{
                                    "name": "HTTP Endpoint",
                                    "settings": [
                                        {
                                            "id": "url",
                                            "name": "Enter URL to send events to",
                                            "description": "Tap to set",
                                            "type": "TEXT",
                                            "required": true,
                                            "defaultValue": ""
                                        },
                                        {
                                            "id": "token",
                                            "name": "Enter the BEARER token to use",
                                            "description": "Tap to set",
                                            "type": "TEXT",
                                            "required": true,
                                            "defaultValue": ""
                                        }
                                    ]
                                }],
                            }
                        }
                    };
                    break;
                default:
                    err = true;
                    break;
            }
            break;

        case 'INSTALL': {
            resp = {"installData": {}};

            const data = event.installData;
            await pollAllInfo(data);
            await updateSubscriptions(data);

            const token = data.authToken;
            const appId = data.installedApp.installedAppId;
            await callJsonApi(`https://api.smartthings.com/v1/installedapps/${appId}/schedules`, token, {
                "name": "background_refresh",
                "cron": {
                    "expression": "*/15 * * * ? *",
                    "timezone": "GMT"
                }
            });
            break;
        }

        case 'UPDATE': {
            resp = {"updateData": {}};

            const data = event.updateData;
            await pollAllInfo(data);
            await updateSubscriptions(data);

            break;
        }

        case 'UNINSTALL':
            resp = {"uninstallData": {}};
            break;

        case 'OAUTH_CALLBACK':
            resp = {"oAuthCallbackData": {}};
            break;

        case 'EVENT':
            resp = {"eventData": {}};
            await handleEvent(event.eventData);
            break;

        default:
            err = true;
            break;
    }

    if (err) {
        throw JSON.stringify(resp);
    }

    console.log(`sending response; payload=${JSON.stringify(resp)}`);
    return resp;
}

async function handleEvent(data) {
    const submitUrl = data.installedApp.config.url[0].stringConfig.value;
    const submitToken = data.installedApp.config.token[0].stringConfig.value;

    for (let i in data.events) {
        const e = data.events[i];
        console.log(`handling event; event=${JSON.stringify(e)}`);
        await submitToEndpoint(submitUrl, submitToken, e);

        if (e.eventType === 'TIMER_EVENT') {
            await pollAllInfo(data);
            await updateSubscriptions(data);
        }
    }
}

// Scrape all devices, locations, and rooms and POST to HTTP Endpoint.
async function pollAllInfo(data) {
    const token = data.authToken;
    const submitUrl = data.installedApp.config.url[0].stringConfig.value;
    const submitToken = data.installedApp.config.token[0].stringConfig.value;

    const devices = await getAllDevices(token);
    const deviceIds = devices.map(i => { return i.deviceId });
    const locations = await getAllLocations(token);
    const locationIds = locations.map(i => { return i.locationId });
    const rooms = [];
    for (let i in locationIds) {
        rooms.push(...await getAllRoomsWithLocationId(token, locationIds[i]));
    }
    const deviceStatuses = [];
    for (let i in deviceIds) {
        deviceStatuses.push(await getDeviceStatusWithDeviceId(token, deviceIds[i]));
    }

    const promises = [];

    for (let i in devices) {
        promises.push(submitToEndpoint(submitUrl, submitToken, {
            "eventType": "DEVICE_INFO",
            "eventTime": (new Date()).toISOString(),
            "deviceInfo": devices[i]
        }));
    }

    for (let i in locations) {
        promises.push(submitToEndpoint(submitUrl, submitToken, {
            "eventType": "LOCATION_INFO",
            "eventTime": (new Date()).toISOString(),
            "locationInfo": locations[i]
        }));
    }

    for (let i in rooms) {
        promises.push(submitToEndpoint(submitUrl, submitToken, {
            "eventType": "ROOM_INFO",
            "eventTime": (new Date()).toISOString(),
            "roomInfo": rooms[i]
        }));
    }

    for (let i in deviceStatuses) {
        promises.push(submitToEndpoint(submitUrl, submitToken, {
            "eventType": "DEVICE_STATUS",
            "eventTime": (new Date()).toISOString(),
            "deviceStatus": deviceStatuses[i]
        }));
    }

    await Promise.all(promises);
}

async function getItems(url, token) {
    const items = [];
    let nextUrl = url;
    do {
        const res = await callJsonApi(nextUrl, token);
        items.push(...res.items);
        nextUrl = res._links ? res._links.next : null;
    } while(nextUrl);
    return items;
}

async function getAllDevices(token) {
    return getItems('https://api.smartthings.com/v1/devices', token);
}

async function getAllLocations(token) {
    const locations = await getItems('https://api.smartthings.com/v1/locations', token);
    const locationIds = locations.map(i => { return i.locationId });

    const locationInfos = [];
    for (let i in locationIds) {
        locationInfos.push(await callJsonApi(`https://api.smartthings.com/v1/locations/${locationIds[i]}`, token));
    }

    return locationInfos;
}

async function getAllRoomsWithLocationId(token, locationId) {
    return getItems(`https://api.smartthings.com/v1/locations/${locationId}/rooms`, token);
}

async function getDeviceStatusWithDeviceId(token, deviceId) {
    const ret = await callJsonApi(`https://api.smartthings.com/v1/devices/${deviceId}/status`, token);
    ret.deviceId = deviceId;
    return ret;
}

async function updateSubscriptions(data) {
    const token = data.authToken;
    const installedAppId = data.installedApp.installedAppId;

    const devices = await getAllDevices(token);
    const deviceIds = new Set(devices.map(d => { return d.deviceId }));
    const subscriptions = await getItems(`https://api.smartthings.com/v1/installedapps/${installedAppId}/subscriptions`, token);
    const subscriptionDeviceIds = new Set(subscriptions.map(s => { return s.device.deviceId }));

    const missingDeviceIds = [...new Set([...deviceIds].filter(x => !subscriptionDeviceIds.has(x)))];

    if (missingDeviceIds.length > 0) {
        console.log(`adding new subscriptions; devices=${JSON.stringify(missingDeviceIds)}`);

        await subscribeWithDeviceIds(missingDeviceIds, token, installedAppId);
    }
}

async function subscribeWithDeviceIds(deviceIds, token, installedAppId) {
    const promises = [];
    for (let i in deviceIds) {
        const payload = {
            "sourceType": "DEVICE",
            "device": {
                "deviceId": deviceIds[i],
                "stateChangeOnly": false
            }
        };
        promises.push(callJsonApi(`https://api.smartthings.com/v1/installedapps/${installedAppId}/subscriptions`, token, payload));
    }

    for (let i in promises) {
        await promises[i];
    }
}

async function submitToEndpoint(url, token, payload) {
    await callJsonApi(url, token, payload);
}

async function callJsonApi(url, token, payload) {
    const options = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        method: payload ? 'POST' : 'GET'
    };

    console.log(`sending api request; url=${JSON.stringify(url)} token=${JSON.stringify(token)} payload=${JSON.stringify(payload)}`);

    return new Promise((resolve, reject) => {
        let body = [];
        const req = https.request(url, options, res => {
            res.on("data", data => { body.push(data) });
            res.on("end", () => {
                body = body.join();
                console.log(`received api response; payload=${JSON.stringify(body)}`);
                if (body.length > 0) {
                    resolve(JSON.parse(body));
                }
            });
        });
        req.on("error", res => {
            reject(res);
        });
        if (payload) {
            req.write(JSON.stringify(payload));
        }
        req.end();
    });
}
