// Webhook Configuration for N8N Assistants

export const WEBHOOK_ASSISTANTS = {
    singlifeCall: {
        key: 'singlife-call',
        name: 'Singlife Call Assistant',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_SINGLIFE || 'PLACEHOLDER_WEBHOOK_URL_1',
        description: 'Singlife policy enquiry and support assistant'
    },
    sgDoctor: {
        key: 'sg-doctor',
        name: 'SG Doctor Recommendation',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_SG_DOCTOR || 'PLACEHOLDER_WEBHOOK_URL_2',
        description: 'Singapore doctor recommendation assistant'
    },
    myDoctor: {
        key: 'my-doctor',
        name: 'MY Doctor Recommendation',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_MY_DOCTOR || 'PLACEHOLDER_WEBHOOK_URL_3',
        description: 'Malaysia doctor recommendation assistant'
    },
    fmClinic: {
        key: 'fm-clinic',
        name: 'FM Clinic',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_FM_CLINIC || 'PLACEHOLDER_WEBHOOK_URL_4',
        description: 'FM Clinic assistant'
    },
    allianzCso: {
        key: 'allianz-cso',
        name: 'Allianz CSO',
        webhookUrl: process.env.REACT_APP_N8N_WEBHOOK_ALLIANZ || 'PLACEHOLDER_WEBHOOK_URL_5',
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
