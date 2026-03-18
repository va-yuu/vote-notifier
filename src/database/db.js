const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../../data/database.json');

const defaultData = {
    users: {},
    votes: {},
    dashboards: {}
};

function loadData() {
    try {
        if (fs.existsSync(dataPath)) {
            const raw = fs.readFileSync(dataPath, 'utf8');
            const loaded = JSON.parse(raw);
            if (!loaded.dashboards) loaded.dashboards = {};
            return loaded;
        }
    } catch (error) {
        console.error('[DB] Erreur lecture:', error);
    }
    return { ...defaultData };
}

function saveData(data) {
    try {
        const dir = path.dirname(dataPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('[DB] Erreur écriture:', error);
    }
}

let data = loadData();

module.exports = {
    users: {
        get: (userId) => data.users[userId] || null,

        create: (userId, username, notifType = 'dm', channelId = null) => {
            const existing = data.users[userId];
            data.users[userId] = {
                user_id: userId,
                minecraft_username: username,
                notification_type: notifType,
                notification_channel: channelId,
                vote_count: existing?.vote_count || 0,
                created_at: existing?.created_at || Date.now()
            };
            saveData(data);
        },

        updateNotification: (userId, type, channelId) => {
            if (data.users[userId]) {
                data.users[userId].notification_type = type;
                data.users[userId].notification_channel = channelId;
                saveData(data);
            }
        },

        delete: (userId) => {
            delete data.users[userId];
            delete data.votes[userId];
            saveData(data);
        }
    },

    votes: {
        get: (userId, siteId) => {
            return data.votes[userId]?.[siteId] || null;
        },

        getAll: (userId) => {
            const userVotes = data.votes[userId];
            if (!userVotes) return [];
            return Object.values(userVotes);
        },

        register: (userId, siteId, cooldown) => {
            const now = Date.now();
            const nextVote = now + cooldown;

            if (!data.votes[userId]) {
                data.votes[userId] = {};
            }

            data.votes[userId][siteId] = {
                user_id: userId,
                site_id: siteId,
                voted_at: now,
                next_vote_at: nextVote,
                notified: false
            };

            if (data.users[userId]) {
                data.users[userId].vote_count = (data.users[userId].vote_count || 0) + 1;
            }

            saveData(data);
            return { votedAt: now, nextVoteAt: nextVote };
        },

        setVoteTime: (userId, siteId, votedAt, cooldown) => {
            const nextVote = votedAt + cooldown;

            if (!data.votes[userId]) {
                data.votes[userId] = {};
            }

            data.votes[userId][siteId] = {
                user_id: userId,
                site_id: siteId,
                voted_at: votedAt,
                next_vote_at: nextVote,
                notified: nextVote <= Date.now()
            };

            saveData(data);
            return { votedAt, nextVoteAt: nextVote };
        },

        resetVote: (userId, siteId) => {
            if (data.votes[userId]?.[siteId]) {
                delete data.votes[userId][siteId];
                saveData(data);
            }
        },

        getPending: () => {
            const now = Date.now();
            const pending = [];

            for (const userId in data.votes) {
                const user = data.users[userId];
                if (!user) continue;

                for (const siteId in data.votes[userId]) {
                    const vote = data.votes[userId][siteId];
                    if (vote.next_vote_at <= now && !vote.notified) {
                        pending.push({
                            ...vote,
                            minecraft_username: user.minecraft_username,
                            notification_type: user.notification_type,
                            notification_channel: user.notification_channel
                        });
                    }
                }
            }

            return pending;
        },

        markNotified: (userId, siteId) => {
            if (data.votes[userId]?.[siteId]) {
                data.votes[userId][siteId].notified = true;
                saveData(data);
            }
        }
    },

    dashboards: {
        get: (visibleDashboardKey) => data.dashboards[visibleDashboardKey] || null,

        getAll: () => Object.entries(data.dashboards).map(([key, value]) => ({
            visibleDashboardKey: key,
            ...value
        })),

        set: (channelId, messageId, userId) => {
            const key = `${channelId}_${userId}`;
            data.dashboards[key] = {
                channel_id: channelId,
                message_id: messageId,
                user_id: userId,
                created_at: Date.now()
            };
            saveData(data);
        },

        remove: (channelId, userId) => {
            const key = `${channelId}_${userId}`;
            delete data.dashboards[key];
            saveData(data);
        },

        getByUser: (userId) => {
            return Object.entries(data.dashboards)
                .filter(([_, v]) => v.user_id === userId)
                .map(([key, value]) => ({ visibleDashboardKey: key, ...value }));
        },

        getByMessage: (messageId) => {
            const entry = Object.values(data.dashboards).find(v => v.message_id === messageId);
            return entry || null;
        }
    },

    db: {
        close: () => {}
    }
};
