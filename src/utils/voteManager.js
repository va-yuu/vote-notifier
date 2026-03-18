const config = require('../../config.json');
const db = require('../database/db');

class VoteManager {
    constructor(client) {
        this.client = client;
        this.checkInterval = null;
        this.dashboardCommand = null;
    }

    setDashboardCommand(cmd) {
        this.dashboardCommand = cmd;
    }

    start() {
        this.checkInterval = setInterval(() => this.checkPendingVotes(), 30000);
        this.dashboardInterval = setInterval(() => this.updateAllDashboards(), 60000);
        console.log('[VoteManager] Démarré - Vérification toutes les 30s');
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        if (this.dashboardInterval) {
            clearInterval(this.dashboardInterval);
            this.dashboardInterval = null;
        }
    }

    getSiteById(siteId) {
        return config.voteSites.find(s => s.id === siteId);
    }

    getVoteUrl(siteId, username) {
        const site = this.getSiteById(siteId);
        if (!site) return null;

        if (siteId === 'serveursminecraft') {
            return site.baseUrl;
        }
        return site.baseUrl + encodeURIComponent(username);
    }

    registerVote(userId, siteId) {
        const site = this.getSiteById(siteId);
        if (!site) return null;
        return db.votes.register(userId, siteId, site.cooldown);
    }

    setVoteTime(userId, siteId, votedAt) {
        const site = this.getSiteById(siteId);
        if (!site) return null;
        return db.votes.setVoteTime(userId, siteId, votedAt, site.cooldown);
    }

    resetAllVotes(userId) {
        config.voteSites.forEach(site => {
            db.votes.resetVote(userId, site.id);
        });
    }

    getUserVoteStatus(userId) {
        const votes = db.votes.getAll(userId);
        const now = Date.now();

        return config.voteSites.map(site => {
            const vote = votes.find(v => v.site_id === site.id);
            const canVote = !vote || vote.next_vote_at <= now;
            const timeRemaining = vote && !canVote ? vote.next_vote_at - now : 0;

            return {
                ...site,
                canVote,
                timeRemaining,
                lastVote: vote?.voted_at || null,
                nextVote: vote?.next_vote_at || null
            };
        });
    }

    formatTimeRemaining(ms) {
        if (ms <= 0) return 'Disponible';

        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    }

    async checkPendingVotes() {
        const pending = db.votes.getPending();

        for (const vote of pending) {
            try {
                const site = this.getSiteById(vote.site_id);
                if (!site) continue;

                const user = await this.client.users.fetch(vote.user_id).catch(() => null);
                if (!user) continue;

                const userDb = db.users.get(vote.user_id);
                if (!userDb) continue;

                await this.sendNotification(user, userDb, site);
                db.votes.markNotified(vote.user_id, vote.site_id);

                await this.updatePublicDashboards(vote.user_id);

            } catch (error) {
                console.error(`[VoteManager] Erreur notification:`, error);
            }
        }
    }

    async updatePublicDashboards(userId) {
        if (!this.dashboardCommand) return;

        const dashboards = db.dashboards.getByUser(userId);
        const user = db.users.get(userId);
        if (!user) return;

        const voteStatus = this.getUserVoteStatus(userId);

        for (const dashboard of dashboards) {
            try {
                const channel = await this.client.channels.fetch(dashboard.channel_id).catch(() => null);
                if (!channel) {
                    db.dashboards.remove(dashboard.channel_id, userId);
                    continue;
                }

                const message = await channel.messages.fetch(dashboard.message_id).catch(() => null);
                if (!message) {
                    db.dashboards.remove(dashboard.channel_id, userId);
                    continue;
                }

                const components = this.dashboardCommand.generateDashboardComponents(user, voteStatus, this, true);

                await message.edit({
                    components,
                    flags: 32768
                });

            } catch (error) {
                if (error.code === 10008) {
                    db.dashboards.remove(dashboard.channel_id, userId);
                    console.log(`[VoteManager] Dashboard supprimé (message introuvable)`);
                } else {
                    console.error(`[VoteManager] Erreur update dashboard:`, error.message);
                }
            }
        }
    }

    async updateAllDashboards() {
        const allDashboards = db.dashboards.getAll();
        const processedUsers = new Set();

        for (const dashboard of allDashboards) {
            if (processedUsers.has(dashboard.user_id)) continue;
            processedUsers.add(dashboard.user_id);

            try {
                await this.updatePublicDashboards(dashboard.user_id);
            } catch (error) {
                console.error(`[VoteManager] Erreur update all dashboards:`, error);
            }
        }
    }

    async sendNotification(user, userDb, site) {
        const { ComponentType, ButtonStyle } = require('discord.js');

        const components = [
            {
                type: ComponentType.Container,
                accent_color: null,
                components: [
                    {
                        type: ComponentType.TextDisplay,
                        content: `## Vote disponible !\n\nTu peux de nouveau voter sur **${site.name}** !`
                    },
                    {
                        type: ComponentType.Separator,
                        spacing: 1
                    },
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.Button,
                                style: ButtonStyle.Link,
                                label: `Voter sur ${site.name}`,
                                url: this.getVoteUrl(site.id, userDb.minecraft_username)
                            },
                            {
                                type: ComponentType.Button,
                                style: ButtonStyle.Secondary,
                                label: 'Ouvrir le Dashboard',
                                custom_id: 'open_dashboard'
                            }
                        ]
                    }
                ]
            }
        ];

        if (userDb.notification_type === 'dm') {
            await user.send({ components, flags: 32768 }).catch(() => {
                console.log(`[VoteManager] Impossible d'envoyer un DM à ${user.tag}`);
            });
        } else if (userDb.notification_type === 'channel' && userDb.notification_channel) {
            const channel = await this.client.channels.fetch(userDb.notification_channel).catch(() => null);
            if (channel) {
                components[0].components.unshift({
                    type: ComponentType.TextDisplay,
                    content: `<@${user.id}>`
                });
                await channel.send({
                    components,
                    flags: 32768
                });
            }
        }
    }
}

module.exports = VoteManager;
