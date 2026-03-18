const { SlashCommandBuilder, ComponentType, ButtonStyle, TextInputStyle, ModalBuilder, TextInputBuilder, ActionRowBuilder } = require('discord.js');
const config = require('../../config.json');
const db = require('../database/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Ouvre le panneau de gestion des votes'),

    async execute(interaction, voteManager) {
        const user = db.users.get(interaction.user.id);

        if (!user) {
            return this.showSetupPanel(interaction);
        }

        return this.showMainDashboard(interaction, voteManager);
    },

    async showSetupPanel(interaction, isUpdate = false) {
        const components = [
            {
                type: ComponentType.Container,
                accent_color: null,
                components: [
                    {
                        type: ComponentType.TextDisplay,
                        content: `## Configuration initiale\n\nBienvenue ! Pour commencer à recevoir des alertes de vote, configure ton pseudo Minecraft.`
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
                                style: ButtonStyle.Primary,
                                label: 'Configurer mon pseudo',
                                custom_id: 'setup_username',
                                emoji: { name: '⚙️' }
                            }
                        ]
                    }
                ]
            }
        ];

        const payload = { components, flags: 32768 | 64 };

        if (isUpdate) {
            await interaction.update(payload);
        } else {
            await interaction.reply(payload);
        }
    },

    generateDashboardComponents(user, voteStatus, voteManager, isPublic = false) {
        const notifLabel = user.notification_type === 'dm' ? 'Messages privés' : 'Salon';

        const infoContainer = {
            type: ComponentType.Container,
            accent_color: null,
            components: [
                {
                    type: ComponentType.TextDisplay,
                    content: `## Dashboard de Vote\n\n**Pseudo Minecraft:** \`${user.minecraft_username}\`\n**Notifications:** ${notifLabel}\n-# ${user.vote_count || 0} vote${(user.vote_count || 0) > 1 ? 's' : ''} enregistré${(user.vote_count || 0) > 1 ? 's' : ''}`
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
                            style: ButtonStyle.Secondary,
                            label: 'Modifier pseudo',
                            custom_id: 'edit_username',
                            emoji: { id: '1482875926802075729', name: 'settings' }
                        },
                        {
                            type: ComponentType.Button,
                            style: ButtonStyle.Secondary,
                            label: 'Paramètres alertes',
                            custom_id: 'notification_settings',
                            emoji: { id: '1482875751308066980', name: 'phone' }
                        },
                        {
                            type: ComponentType.Button,
                            style: ButtonStyle.Secondary,
                            label: 'Corriger mes votes',
                            custom_id: 'edit_votes_menu',
                            emoji: { id: '1482875436168909040', name: 'clock' }
                        }
                    ]
                }
            ]
        };

        const voteLines = voteStatus.map(site => {
            if (site.canVote) {
                return `**${site.name}**\n<a:vert_load:1482874606691024946> Disponible`;
            } else {
                const timestamp = Math.floor(site.nextVote / 1000);
                return `**${site.name}**\n<a:red_load:1482874617382047807> <t:${timestamp}:R>`;
            }
        }).join('\n\n');

        const voteButtons = [];
        const confirmButtons = [];

        voteStatus.forEach(site => {
            voteButtons.push({
                type: ComponentType.Button,
                style: ButtonStyle.Link,
                label: site.name.split('.')[0],
                url: voteManager.getVoteUrl(site.id, user.minecraft_username)
            });

            confirmButtons.push({
                type: ComponentType.Button,
                style: site.canVote ? ButtonStyle.Success : ButtonStyle.Danger,
                label: site.canVote ? `✓ ${site.name.split('.')[0]}` : `✗ ${site.name.split('.')[0]}`,
                custom_id: `confirm_vote_${site.id}`,
                disabled: !site.canVote
            });
        });

        const voteContainer = {
            type: ComponentType.Container,
            accent_color: null,
            components: [
                {
                    type: ComponentType.TextDisplay,
                    content: `## Sites de Vote\n\n${voteLines}`
                },
                {
                    type: ComponentType.Separator,
                    spacing: 1
                },
                {
                    type: ComponentType.TextDisplay,
                    content: `**Étape 1:** Clique sur un site pour voter`
                },
                {
                    type: ComponentType.ActionRow,
                    components: voteButtons
                },
                {
                    type: ComponentType.Separator,
                    spacing: 1
                },
                {
                    type: ComponentType.TextDisplay,
                    content: `**Étape 2:** Confirme ton vote`
                },
                {
                    type: ComponentType.ActionRow,
                    components: confirmButtons
                }
            ]
        };

        const actionButtons = [
            {
                type: ComponentType.Button,
                style: ButtonStyle.Secondary,
                label: 'Rafraîchir',
                custom_id: 'refresh_dashboard',
                emoji: { id: '1482876319523143893', name: 'bow' }
            }
        ];

        if (!isPublic) {
            actionButtons.push({
                type: ComponentType.Button,
                style: ButtonStyle.Primary,
                label: 'Afficher dans ce salon',
                custom_id: 'post_public_dashboard',
                emoji: { id: '1482876116443201709', name: 'camera' }
            });
            actionButtons.push({
                type: ComponentType.Button,
                style: ButtonStyle.Danger,
                label: 'Supprimer mes données',
                custom_id: 'delete_data'
            });
        }

        const actionsContainer = {
            type: ComponentType.Container,
            accent_color: null,
            components: [
                {
                    type: ComponentType.ActionRow,
                    components: actionButtons
                }
            ]
        };

        return [infoContainer, voteContainer, actionsContainer];
    },

    async showMainDashboard(interaction, voteManager, isUpdate = false) {
        const user = db.users.get(interaction.user.id);
        if (!user) return this.showSetupPanel(interaction, isUpdate);

        const voteStatus = voteManager.getUserVoteStatus(interaction.user.id);
        const components = this.generateDashboardComponents(user, voteStatus, voteManager, false);

        const payload = {
            components,
            flags: 32768 | 64
        };

        if (isUpdate) {
            await interaction.update(payload);
        } else {
            await interaction.reply(payload);
        }
    },

    async postPublicDashboard(interaction, voteManager) {
        const user = db.users.get(interaction.user.id);
        if (!user) return;

        const voteStatus = voteManager.getUserVoteStatus(interaction.user.id);
        const components = this.generateDashboardComponents(user, voteStatus, voteManager, true);

        const message = await interaction.channel.send({
            components,
            flags: 32768
        });

        db.dashboards.set(interaction.channel.id, message.id, interaction.user.id);

        await interaction.update({
            components: [{
                type: ComponentType.Container,
                accent_color: null,
                components: [
                    {
                        type: ComponentType.TextDisplay,
                        content: `## Dashboard publié !\n\nTon dashboard a été posté dans ce salon et se mettra à jour automatiquement.`
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
                                style: ButtonStyle.Secondary,
                                label: 'Fermer',
                                custom_id: 'dismiss_message'
                            }
                        ]
                    }
                ]
            }],
            flags: 32768 | 64
        });
    },

    async showNotificationSettings(interaction, voteManager) {
        const user = db.users.get(interaction.user.id);
        if (!user) return;

        const components = [
            {
                type: ComponentType.Container,
                accent_color: null,
                components: [
                    {
                        type: ComponentType.TextDisplay,
                        content: `## Paramètres de notification\n\nChoisis comment tu veux être alerté quand un vote est disponible.`
                    },
                    {
                        type: ComponentType.Separator,
                        spacing: 1
                    },
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.StringSelect,
                                custom_id: 'select_notification_type',
                                placeholder: 'Type de notification',
                                options: [
                                    {
                                        label: 'Messages privés (DM)',
                                        value: 'dm',
                                        description: 'Recevoir les alertes en message privé',
                                        default: user.notification_type === 'dm'
                                    },
                                    {
                                        label: 'Salon Discord',
                                        value: 'channel',
                                        description: 'Recevoir les alertes dans un salon spécifique',
                                        default: user.notification_type === 'channel'
                                    }
                                ]
                            }
                        ]
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
                                style: ButtonStyle.Secondary,
                                label: 'Retour',
                                custom_id: 'back_to_dashboard'
                            }
                        ]
                    }
                ]
            }
        ];

        await interaction.update({ components, flags: 32768 | 64 });
    },

    async showChannelSelect(interaction) {
        const components = [
            {
                type: ComponentType.Container,
                accent_color: null,
                components: [
                    {
                        type: ComponentType.TextDisplay,
                        content: `## Sélection du salon\n\nChoisis le salon où tu veux recevoir les alertes de vote.`
                    },
                    {
                        type: ComponentType.Separator,
                        spacing: 1
                    },
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.ChannelSelect,
                                custom_id: 'select_notification_channel',
                                placeholder: 'Sélectionne un salon',
                                channel_types: [0]
                            }
                        ]
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
                                style: ButtonStyle.Secondary,
                                label: 'Retour',
                                custom_id: 'notification_settings'
                            }
                        ]
                    }
                ]
            }
        ];

        await interaction.update({ components, flags: 32768 | 64 });
    },

    async showEditVotesMenu(interaction) {
        const options = config.voteSites.map(site => ({
            label: site.name,
            value: site.id,
            description: `Modifier l'heure de vote pour ${site.name}`
        }));

        options.push({
            label: 'Réinitialiser tous les votes',
            value: 'reset_all',
            description: 'Remettre tous les votes à disponible'
        });

        const components = [
            {
                type: ComponentType.Container,
                accent_color: null,
                components: [
                    {
                        type: ComponentType.TextDisplay,
                        content: `## Corriger mes votes\n\nSélectionne le site pour lequel tu veux modifier l'heure de ton dernier vote.`
                    },
                    {
                        type: ComponentType.Separator,
                        spacing: 1
                    },
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.StringSelect,
                                custom_id: 'select_vote_to_edit',
                                placeholder: 'Choisis un site',
                                options
                            }
                        ]
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
                                style: ButtonStyle.Secondary,
                                label: 'Retour',
                                custom_id: 'back_to_dashboard'
                            }
                        ]
                    }
                ]
            }
        ];

        await interaction.update({ components, flags: 32768 | 64 });
    },

    async showDeleteConfirmation(interaction) {
        const components = [
            {
                type: ComponentType.Container,
                accent_color: null,
                components: [
                    {
                        type: ComponentType.TextDisplay,
                        content: `## Confirmation de suppression\n\nEs-tu sûr de vouloir supprimer toutes tes données ? Cette action est irréversible.\n\n- Ton pseudo Minecraft\n- Tes préférences de notification\n- Ton historique de votes`
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
                                style: ButtonStyle.Danger,
                                label: 'Confirmer la suppression',
                                custom_id: 'confirm_delete_data'
                            },
                            {
                                type: ComponentType.Button,
                                style: ButtonStyle.Secondary,
                                label: 'Annuler',
                                custom_id: 'back_to_dashboard'
                            }
                        ]
                    }
                ]
            }
        ];

        await interaction.update({ components, flags: 32768 | 64 });
    },

    async showVoteConfirmed(interaction, siteId, voteManager) {
        const user = db.users.get(interaction.user.id);
        if (!user) return;

        const site = config.voteSites.find(s => s.id === siteId);
        if (!site) return;

        const voteInfo = voteManager.registerVote(interaction.user.id, siteId);
        const nextVoteDate = new Date(voteInfo.nextVoteAt);

        await voteManager.updatePublicDashboards(interaction.user.id);

        const components = [
            {
                type: ComponentType.Container,
                accent_color: null,
                components: [
                    {
                        type: ComponentType.TextDisplay,
                        content: `## Vote enregistré !\n\nTon vote sur **${site.name}** a été enregistré.\n\n**Prochain vote disponible:**\n<t:${Math.floor(nextVoteDate.getTime() / 1000)}:R> (<t:${Math.floor(nextVoteDate.getTime() / 1000)}:t>)\n\nTu recevras une notification quand tu pourras voter à nouveau.`
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
                                style: ButtonStyle.Primary,
                                label: 'Retour au Dashboard',
                                custom_id: 'back_to_dashboard'
                            }
                        ]
                    }
                ]
            }
        ];

        await interaction.update({ components, flags: 32768 | 64 });
    },

    createUsernameModal(isEdit = false) {
        const modal = new ModalBuilder()
            .setCustomId(isEdit ? 'modal_edit_username' : 'modal_setup_username')
            .setTitle(isEdit ? 'Modifier le pseudo' : 'Configuration du pseudo');

        const usernameInput = new TextInputBuilder()
            .setCustomId('minecraft_username')
            .setLabel('Ton pseudo Minecraft')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: vayuu')
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(16);

        modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));

        return modal;
    },

    createEditVoteModal(siteId) {
        const site = config.voteSites.find(s => s.id === siteId);

        const modal = new ModalBuilder()
            .setCustomId(`modal_edit_vote_${siteId}`)
            .setTitle(`Modifier vote - ${site?.name || siteId}`);

        const dateInput = new TextInputBuilder()
            .setCustomId('vote_date')
            .setLabel('Date du vote (JJ/MM/AAAA)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 15/03/2026')
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(10);

        const timeInput = new TextInputBuilder()
            .setCustomId('vote_time')
            .setLabel('Heure du vote (HH:MM)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Ex: 14:30')
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(5);

        modal.addComponents(
            new ActionRowBuilder().addComponents(dateInput),
            new ActionRowBuilder().addComponents(timeInput)
        );

        return modal;
    },

    parseVoteDateTime(dateStr, timeStr) {
        const dateParts = dateStr.split('/');
        const timeParts = timeStr.split(':');

        if (dateParts.length !== 3 || timeParts.length !== 2) {
            return null;
        }

        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const year = parseInt(dateParts[2], 10);
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);

        if (isNaN(day) || isNaN(month) || isNaN(year) || isNaN(hours) || isNaN(minutes)) {
            return null;
        }

        const date = new Date(year, month, day, hours, minutes);

        if (isNaN(date.getTime())) {
            return null;
        }

        return date.getTime();
    }
};
