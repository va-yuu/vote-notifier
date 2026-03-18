const { REST, Routes } = require('discord.js');
const config = require('../config.json');
const dashboardCommand = require('./commands/dashboard');

const commands = [dashboardCommand.data.toJSON()];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log('Déploiement des commandes slash...');

        if (config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands }
            );
            console.log(`✓ Commandes déployées sur le serveur ${config.guildId}`);
        }

    } catch (error) {
        console.error('Erreur lors du déploiement:', error);
    }
})();
