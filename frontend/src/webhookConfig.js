// Webhook Configuration for N8N Assistants

export const WEBHOOK_ASSISTANTS = {
    singlifeCall: {
        key: 'singlife-call',
        name: 'Singlife Call Assistant',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_SINGLIFE || 'https://ulink.app.n8n.cloud/webhook/e7c1ec59-d93d-4329-926c-57f425aa2e84',
        description: 'Singlife policy enquiry and support assistant'
    },
    sgDoctor: {
        key: 'sg-doctor',
        name: 'SG Doctor Recommendation',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_SG_DOCTOR || 'https://ulink.app.n8n.cloud/webhook/doctor-recommend',
        description: 'Singapore doctor recommendation assistant'
    },
    myDoctor: {
        key: 'my-doctor',
        name: 'MY Doctor Recommendation',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_MY_DOCTOR || 'https://ulink.app.n8n.cloud/webhook/doctor-recommend',
        description: 'Malaysia doctor recommendation assistant'
    },
    fmClinic: {
        key: 'fm-clinic',
        name: 'FM Clinic',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_FM_CLINIC || 'https://ulink.app.n8n.cloud/webhook/e5b1052a-9cf7-47d6-b9ed-09e54a43aa92',
        description: 'FM Clinic assistant'
    },
    allianzCso: {
        key: 'allianz-cso',
        name: 'Allianz CSO',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_ALLIANZ || 'https://ulink.app.n8n.cloud/webhook/abeea2c1-b806-49da-b808-891c90b76ee4',
        description: 'Allianz customer service assistant'
    }
};

// Helper function to get all webhook assistants as array
export const getWebhookAssistants = () => {
    return Object.values(WEBHOOK_ASSISTANTS);
};

// Helper function to get webhook URL by assistant key
export const getWebhookUrl = (assistantKey) => {
    const assistant = Object.values(WEBHOOK_ASSISTANTS).find(a => a.key === assistantKey);
    return assistant?.webhookUrl;
};

// Helper function to check if assistant is webhook-based
export const isWebhookAssistant = (assistantKey) => {
    return Object.values(WEBHOOK_ASSISTANTS).some(a => a.key === assistantKey);
};
