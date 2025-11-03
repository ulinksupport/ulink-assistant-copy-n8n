const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../../config.js');

const User = require('../../models/users/user.mongo.js');
const { doApplyUserAssistant } = require('../../models/user-assistants/user-assistant.model.js');
const { getListOfAssistant } = require('../../models/assistants/assistant.model.js');
const { retrieveUsers } = require('../../models/users/user.model.js');
const { getUserById, deleteUserById } = require('../../models/users/user.model.js');

const Session = (() => {
  try {
    return require('../../models/sessions/session.mongo.js');
  } catch (e) {
    return null;
  }
})();

const UserAssistantMongo = (() => {
  try {
    return require('../../models/user-assistants/user-assistant.mongo');
  } catch (e) {
    return null;
  }
})();

async function create(req, res, next) {
  try {
    const { username, password, assistantIds } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ error: 'User already exists' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: passwordHash, role: 'user' });

    let listOfAsstId = assistantIds;
    if (!listOfAsstId || listOfAsstId?.length === 0) {
      // fallback — give access to all assistants if none provided
      let asstList = await getListOfAssistant();
      listOfAsstId = asstList.map(asst => asst?._id);
    }

    await doApplyUserAssistant(user?.id, listOfAsstId);

    return res.status(201).json({ id: user._id, username: user.username, assistantIds: listOfAsstId });
  } catch (err) {
    return next(err);
  }
};

async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ sub: String(user._id), username: user.username }, JWT_SECRET, { expiresIn: '2h' });
    return res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  } catch (err) {
    return next(err);
  }
};

async function getListOfUsers(req, res) {
  try {
    const users = await retrieveUsers({ role: 'user' });
    // return users (aggregation already returns allowedAssistantIds)
    return res.status(200).json(users);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to list users' });
  }
}

async function updateUser(req, res, next) {
  try {
    const id = req.params.id;
    const { username, password, assistantIds } = req.body || {};

    const user = await getUserById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // update fields
    if (username) user.username = username;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    await user.save();

    // apply assistants if provided
    if (Array.isArray(assistantIds)) {
      await doApplyUserAssistant(user._id, assistantIds);
    }

    const updated = {
      id: user._id,
      username: user.username,
      assistantIds: Array.isArray(assistantIds) ? assistantIds : undefined
    };

    return res.json(updated);
  } catch (err) {
    return next(err);
  }
}

/**
 * Delete user
 * - validate user exists
 * - check linked sessions/chats (best-effort)
 * - delete user-assistant links and user document
 */
async function deleteUser(req, res, next) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'Missing user id' });

    const user = await getUserById(id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Best-effort check: see if there are session/chat records referencing this userId
    // We attempt to use the Session model if present.
    if (Session) {
      try {
        // If there are session documents with userId set, refuse deletion
        const linked = await Session.exists({ userId: user._id });
        if (linked) {
          return res.status(400).json({ error: 'User still has linked session/chat records' });
        }
      } catch (err) {
        // ignore the check if session query fails — continue deletion below
        console.warn('deleteUser: session check failed (ignored):', err.message || err);
      }
    }

    // Remove user assistants links (if user-assistant collection exists)
    if (UserAssistantMongo) {
      try {
        await UserAssistantMongo.deleteMany({ userId: user._id });
      } catch (err) {
        // ignore and continue
        console.warn('deleteUser: failed to remove user-assistant links:', err.message || err);
      }
    }

    // Delete user
    const deleted = await deleteUserById(user._id);
    if (!deleted) {
      return res.status(500).json({ error: 'Failed to delete user' });
    }

    return res.json({ ok: true, id: user._id });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  create,
  login,
  getListOfUsers,
  updateUser,
  deleteUser
}
