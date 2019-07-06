const Discord = require('discord.js');
const fs = require('fs');
const client = new Discord.Client();
const apis = require('./config/apis.json');
const config = require('./config/config.json');

let commands = {
    "join": config.cmdprefix + "join",
    "leave": config.cmdprefix + "leave",
    "shutdown": config.cmdprefix + "shutdown",
    "restart": config.cmdprefix + "restart"
}

client.on('ready', () => {
    console.log('Logged in');
    let guilds = client.guilds.keyArray();
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }
    guilds.forEach(function(item, index) {
        if (!fs.existsSync('./data/' + item)) {
            fs.mkdirSync('./data/' + item);
        }
    });
});

client.on('message', msg => {

    // Join voice channel
    if (msg.content.startsWith(commands.join)) {
        let voiceChnl = msg.member.voiceChannel;
        if (voiceChnl != undefined) {
            voiceChnl.join();
        } else {
            msg.reply("You need to be in a voice channel to do that.");
        }
    }

    // Leave voice channel
    else if (msg.content.startsWith(commands.leave)) {
        if (client.voiceConnections.get(msg.guild.id) != undefined) {
            voiceChnl = client.voiceConnections.get(msg.guild.id).channel;
            voiceChnl.leave();
        } else {
            msg.reply("I am not in a voice channel.");
        }
    }

    // Shutdown bot
    else if (msg.content.startsWith(commands.shutdown)) {
        console.log("Shutdown request received.");
        msg.channel.sendMessage("Goodbye! Miss you already! :heart:");
        client.destroy();
    }

    // Restart bot
    else if (msg.content.startsWith(commands.restart)) {
        console.log("Restart request received.");
        msg.channel.sendMessage("Restarting...");
        client.destroy().then(status => {
            client.login(apis.discord);
        });
    }
});

client.login(apis.discord);