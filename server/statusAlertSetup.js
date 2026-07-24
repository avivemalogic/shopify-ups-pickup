require('dotenv').config();
const { ENV } = process.env;
const { getFieldFromIntegrationData, getApiEnv, getRestApiAccessToken, getResponseJsonAndSaveLogs, getDate } = require('./helper');

const STATUS_ALERT_FIELD_KEYS = [
    'enableStatusAlertWebhook',
    'statusAlertInDistribution',
    'statusAlertException',
    'statusAlertDelivered',
    'statusAlertAll',
];

const PROCESS_NAME_SHOPIFY_ID = 11;
const NOTIFICATION_TYPE_WEBHOOK = 1;

function getStatusAlertSetupApiBase(integrationData) {
    const apiEnv = getApiEnv(integrationData);
    if (apiEnv === 'test') {
        return 'https://t-internalapi.ups.co.il/';
    }

    return 'https://internalapi.ups.co.il/';
}

function buildStatusAlertPayload(shop, settings) {
    const scopeValue = getFieldFromIntegrationData(settings.integrationData, 'upsIntegrationScope');
    const custNo = Number(scopeValue);

    if (!scopeValue || Number.isNaN(custNo)) {
        return { error: 'Invalid custNo (REST Api Scope must be a number)' };
    }

    const allChecked = settings.enableStatusAlertWebhook === 'true' && settings.statusAlertAll === 'true';
    let custAlerts;

    if (settings.enableStatusAlertWebhook !== 'true') {
        custAlerts = [
            { alerts_id: 1, status: 0 },
            { alerts_id: 2, status: 0 },
            { alerts_id: 3, status: 0 },
            { alerts_id: 999, status: 0 },
        ];
    } else if (allChecked) {
        custAlerts = [{ alerts_id: 999, status: 1 }];
    } else {
        custAlerts = [
            {
                alerts_id: 1,
                status: settings.statusAlertInDistribution === 'true' ? 1 : 0,
            },
            {
                alerts_id: 2,
                status: settings.statusAlertException === 'true' ? 1 : 0,
            },
            {
                alerts_id: 3,
                status: settings.statusAlertDelivered === 'true' ? 1 : 0,
            },
        ];
    }

    return {
        custNo,
        contactSeqNo: 0,
        webhooksId: 1,
        platformId: PROCESS_NAME_SHOPIFY_ID,
        urlShop: shop,
        notification: [
            {
                notificationType: NOTIFICATION_TYPE_WEBHOOK,
                CustAlerts: custAlerts,
            },
        ],
    };
}

function hasStatusAlertSettingsChanged(changedFields) {
    if (!Array.isArray(changedFields) || !changedFields.length) {
        return false;
    }

    return changedFields.some((field) => STATUS_ALERT_FIELD_KEYS.includes(field));
}

function getStatusAlertSettingsFromIntegration(integrationData) {
    return {
        enableStatusAlertWebhook: getFieldFromIntegrationData(integrationData, 'enableStatusAlertWebhook') || 'false',
        statusAlertInDistribution: getFieldFromIntegrationData(integrationData, 'statusAlertInDistribution') || 'false',
        statusAlertException: getFieldFromIntegrationData(integrationData, 'statusAlertException') || 'false',
        statusAlertDelivered: getFieldFromIntegrationData(integrationData, 'statusAlertDelivered') || 'false',
        statusAlertAll: getFieldFromIntegrationData(integrationData, 'statusAlertAll') || 'false',
    };
}

function getChangedStatusAlertFieldKeys(integrationData, savedFieldIds) {
    if (!integrationData || integrationData.error || !Array.isArray(integrationData)) {
        return [];
    }

    return integrationData
        .filter((item) => STATUS_ALERT_FIELD_KEYS.includes(item.key) && savedFieldIds.includes(String(item.id)))
        .map((item) => item.key);
}

async function syncStatusAlertSetup(shop, integrationData, settings) {
    const { isLoggedIn, apiAccessToken } = await getRestApiAccessToken(integrationData, 'status-alert');
    if (!isLoggedIn) {
        return { error: 'REST API Auth Error' };
    }

    const payload = buildStatusAlertPayload(shop, {
        ...settings,
        integrationData,
    });

    if (payload.error) {
        return payload;
    }

    const apiUrl = `${getStatusAlertSetupApiBase(integrationData)}Webhooks/StatusAlertSetup`;
    const requestOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiAccessToken}`,
        },
        body: JSON.stringify(payload),
    };

    try {
        const response = await fetch(apiUrl, requestOptions);
        const data = await getResponseJsonAndSaveLogs(
            'syncStatusAlertSetup',
            shop,
            apiUrl,
            requestOptions,
            response
        );

        if (!response.ok) {
            return {
                error: data?.Message || data?.message || `StatusAlertSetup failed (${response.status})`,
            };
        }

        if (data?.Message || (data?.ErrorCode && data.ErrorCode > 0)) {
            return {
                error: data.Message || data.ErrorMessage || 'StatusAlertSetup failed',
            };
        }

        return { success: true, payload };
    } catch (e) {
        console.log(getDate() + ' syncStatusAlertSetup Error: ', e);
        return { error: String(e) };
    }
}

module.exports = {
    STATUS_ALERT_FIELD_KEYS,
    buildStatusAlertPayload,
    hasStatusAlertSettingsChanged,
    getStatusAlertSettingsFromIntegration,
    getChangedStatusAlertFieldKeys,
    syncStatusAlertSetup,
};
