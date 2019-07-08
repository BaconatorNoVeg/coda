const Discord = require('discord.js');
const youtubedl = require('youtube-dl');
const request = require('request');
const crypto = require('crypto');
const fs = require('fs');
const client = new Discord.Client();
const apis = require('./config/apis.json');
const config = require('./config/config.json');
let dispatcher;
let audioPlaying = false;
let vidQueue = [];

if (!fs.existsSync('./cache')) {
    fs.mkdirSync('./cache');
}

let commands = {
    "join": config.cmdprefix + "join",
    "leave": config.cmdprefix + "leave",
    "play": config.cmdprefix + "play",
    "stop": config.cmdprefix + "stop",
    "skip": config.cmdprefix + "skip",
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

    let voiceChnl = msg.member.voiceChannel;

    // Join voice channel
    if (msg.content.startsWith(commands.join)) {
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

    // Play music
    else if (msg.content.startsWith(commands.play)) {
        if (msg.content.length <= commands.play.length) {
            if (msg.attachments.array().length > 0) {
                // msg.channel.send("I can't play audio attachments yet.");
                queueVideo(msg.attachments.first().url, msg, true);
            } else {
                // TODO: Handle invalid command
            }
        } else {
            let ytlink = msg.content.split(" ")[1];
            if (!ytlink.startsWith("https://www.youtube.com/watch?v=") && !ytlink.startsWith("https://youtu.be/")) {
                // TODO: Handle invalid link
            } else {
                queueVideo(ytlink, msg, false);
            }
        }
    }

    // Stop playing music
    else if (msg.content.startsWith(commands.stop)) {
        if (audioPlaying) {
            vidQueue = [];  // Clear queue
            dispatcher.end("Requested to stop.");
            resetSelf(msg.guild);
        }
    }

    // Skip current video
    else if (msg.content.startsWith(commands.skip)) {
        if (audioPlaying) {
            dispatcher.end("Skipping...");
        } else {
            msg.channel.send("There is no audio playing!");
        }
    }

    // Shutdown bot
    else if (msg.content.startsWith(commands.shutdown)) {
        console.log("Shutdown request received.");
        resetSelf(msg.guild);
        msg.channel.send("Goodbye! Miss you already! :heart:");
        client.destroy();
    }

    // Restart bot
    else if (msg.content.startsWith(commands.restart)) {
        console.log("Restart request received.");
        msg.channel.send("Restarting...");
        client.destroy().then(status => {
            client.login(apis.discord);
        });
    }

    // Delete messages containing commands
    if (msg.content.startsWith(config.cmdprefix)) {
        //msg.delete().then(msg => {}).catch(console.error);
    }
});

function playVideo(videoData) {
    let voiceChnl = videoData.voiceChannel;
    if (voiceChnl != undefined) {
        voiceChnl.join().then(connection => {
            audioPlaying = true;
            sendNowPlayingEmbed(videoData);
            if (videoData.title === "Uploaded audio") {
                console.log("local");
                dispatcher = connection.playFile(videoData.audiostream, {volume: 0.5});
            } else {
                dispatcher = connection.playStream(videoData.audiostream, {volume: config.audioVolume});
            }
            client.user.setActivity(videoData.title);
            dispatcher.on("end", () => {
                if (queueEmpty()) {
                    videoData.responseChannel.send("Queue is empty. Disconnecting.");
                    voiceChnl.leave();
                    client.user.setActivity("");
                    audioPlaying = false;
                } else {
                    let nextVideo = vidQueue.shift();
                    playVideo(nextVideo);
                }
            })
        }).catch(console.error);
    }
    
    // let video = youtubedl(link, ['-x', '--audio-format', 'mp3']);
    // youtubedl.getInfo(link, function(err, data) {
    //     let videoName = data.title;
    //     let videoThumb = data.thumbnail;
    //     if (err) throw err;
    //     if (voiceChnl != undefined) {
    //         msg.guild.members.get(client.user.id).setNickname("DJ Coda");
    //         voiceChnl.join().then(connection => {
    //             sendMusicEmbed(data, msg);
    //             dispatcher = connection.playStream(video, {volume: config.audioVolume});
    //             client.user.setActivity(videoName);
    //             dispatcher.on("end", () => {
    //                 if (queueEmpty()) {
    //                     voiceChnl.leave();
    //                     resetSelf(msg.guild);
    //                 } else {
    //                     let nextVideo = vidQueue.shift();
    //                     playVideo(nextVideo, msg);
    //                 }
    //             });
    //         });
    //     }
    // });
}

function queueEmpty() {
    return vidQueue.length <= 0;
}

function queueVideo(link, msg, local) {
    // vidQueue.push(link);
    if (!local) {
        youtubedl.getInfo(link, function(err, data) {
            let streamData = youtubedl(link, ['-x', '--audio-format', 'mp3']);
            let queuer = "";
            if (msg.member.nickname != null) {
                queuer = msg.member.nickname;
            } else {
                queuer = msg.author.username;
            }
            let videoData = {
                "audiostream": streamData,
                "title": data.title,
                "uploader": data.uploader,
                "length": data._duration_hms,
                "thumbnail": data.thumbnail,
                "url": data.webpage_url,
                "queuer": queuer,
                "queuerAvatar": msg.member.user.avatarURL,
                "responseChannel": msg.channel,
                "voiceChannel": msg.member.voiceChannel
            }
            if (!audioPlaying) {
                playVideo(videoData);
            } else {
                vidQueue.push(videoData);
                sendQueueEmbed(videoData)
            }
        });
    } else {
        let name = './cache/' + client.uptime;
            request(link).pipe(fs.createWriteStream(name));
            let queuer = "";
            if (msg.member.nickname != null) {
                queuer = msg.member.nickname;
            } else {
                queuer = msg.author.username;
            }
            let videoData = {
                "audiostream": name,
                "title": "Uploaded audio",
                "uploader": undefined,
                "length": undefined,
                "thumbnail": undefined,
                "url": undefined,
                "queuer": queuer,
                "queuerAvatar": msg.member.user.avatarURL,
                "responseChannel": msg.channel,
                "voiceChannel": msg.member.voiceChannel
            }
            if (!audioPlaying) {
                playVideo(videoData);
            } else {
            vidQueue.push(videoData);
            sendQueueEmbed(videoData)
            }
    }
}

function sendQueueEmbed(data) {
    let embed = new Discord.RichEmbed();
    embed.setColor("#FF0000");
    embed.setTitle("YouTube");
    embed.setDescription(data.queuer + " added a video to the queue");
    embed.setThumbnail(data.thumbnail);
    embed.addField("Video", data.title);
    embed.addField("Uploader", data.uploader, true);
    embed.addField("Length", data.length, true);
    embed.setURL(data.url);
    data.responseChannel.send(embed);
}

function sendNowPlayingEmbed(data) {
    let embed = new Discord.RichEmbed();
    embed.setColor("#FF0000");
    embed.setTitle("YouTube");
    embed.setDescription("Playing video requested by " + data.queuer);
    embed.setThumbnail(data.queuerAvatar);
    embed.addField("Video", data.title);
    embed.addField("Uploader", data.uploader, true);
    embed.addField("Length", data.length, true);
    embed.setImage(data.thumbnail);
    embed.setURL(data.url);
    data.responseChannel.send(embed);
}

function resetSelf(guild) {
    client.user.setActivity("");
    guild.members.get(client.user.id).setNickname("Coda");
}

client.login(apis.discord);