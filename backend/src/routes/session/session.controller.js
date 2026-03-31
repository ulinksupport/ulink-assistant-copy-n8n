const mongoose = require('mongoose');
const moment = require('moment');

const { getSessionBySID, saveSession } = require('../../models/sessions/session.model');
const { checkExistAsstRecord } = require('../../models/assistants/assistant.model');
const { checkExistUserRecord } = require('../../models/users/user.model');
const { doCreateNewChat } = require('../chat/chat.controller');

async function doGetSessionBySID(req, res) {

    const { sid } = req.params;

    if (!sid) {
        return res.status(400).json({ message: 'Invalid SID' });
    }

    const session = await getSessionBySID(sid);
    if (!session) {
        return res.status(400).json({ message: 'Session Record not found.'});
    }

    return res.status(200).json(session);
}

async function doPostNewSession(req, res) {

    const { assistantId, userId } = req.body;

    if (!assistantId && !mongoose.isValidObjectId(assistantId)) {
        return res.status(400).json({ message: 'Invalid Assistant ID.'});
    }

    if (!userId) {
        return res.status(400).json({ message: 'Invalid User ID.'});
    }

    // check assisstant & user exist or not.
    // For webhook-based assistants ("my-doctor", "sg-doctor"), we can bypass backend document validation or handle gracefully.
    const isWebhookApp = assistantId === 'sg-doctor' || assistantId === 'my-doctor' || assistantId === 'fm-clinic' || assistantId === 'allianz-cso' || assistantId === 'singlife-call' || assistantId === 'provider-search-my';
    
    if (!isWebhookApp) {
        if (!mongoose.isValidObjectId(assistantId)) {
            return res.status(400).json({ message: 'Assistant ID is not a valid ObjectId.' });
        }
        try {
            if (!await checkExistAsstRecord({_id: assistantId})) {
                return res.status(400).json({ message: 'Assistant ID not exist.'});
            }
        } catch (error) {
            return res.status(500).json({ message: 'Error checking Assistant record.'});
        }
    }

    if (!mongoose.isValidObjectId(userId)) {
        return res.status(400).json({ message: 'User ID is not a valid ObjectId.' });
    }

    try {
        if (!await checkExistUserRecord({ _id: userId })) {
            return res.status(400).json({ message: 'User ID not exist.'});
        }
    } catch (error) {
         return res.status(500).json({ message: 'Error checking User record.'});
    }

    const sessionId = doGenerateSessionKey(assistantId, userId);

    const newSession = {
        sessionId: sessionId        
    };

    try {
        await saveSession(newSession);
        
        const chatPayload = {
            userId,
            sessionId,
            title: `(${moment(new Date()).format('DD MMMM YYYY HH:mm A')}) - New Chat`
        };
        
        if (!isWebhookApp) {
            chatPayload.assistantId = assistantId;
        }

        const chat = await doCreateNewChat(chatPayload);

        return res.status(201).json({ 
            message: 'Succesfully Created New Chat Session',
            data: {
                chat
            }
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Failed to create session.'});
    }
    
}

async function doPutExistingSession(req, res) {
    const { sessionId } = req.body;

    const existingSession = await getSessionBySID(sessionId);
    if (!existingSession) {
        return res.json({ message: 'Session ID not found.'});
    }

    const updateSession = {
        ...existingSession
    };
    updateSession.lastUsed = new Date();

    try {
        saveSession(updateSession);
        return res.status(202).json({ message: 'Success updated lastused session.'});
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Failed to update session.'});
    }
}

function doGenerateSessionKey(assistantId, userId) {

    const sanityAsstId = assistantId.toLowerCase().replace(' ', '_');
    const sanityUserId = userId.toLowerCase().replace(' ', '_');

    let currentDateTime = new Date();
    currentDateTime = tsLocalYYYYMMDDHHmmss(currentDateTime);

    const newSessionKey = `${currentDateTime}.${sanityAsstId}.${sanityUserId}`;
    return newSessionKey;
}

function tsLocalYYYYMMDDHHmmss(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0'); // 0-based month
  const dd   = String(d.getDate()).padStart(2, '0');
  const HH   = String(d.getHours()).padStart(2, '0');     // local time
  const MM   = String(d.getMinutes()).padStart(2, '0');
  const SS   = String(d.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}${HH}${MM}${SS}`;
}

module.exports = {
    doGetSessionBySID,
    doPostNewSession,
    doPutExistingSession
};