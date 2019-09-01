const chalk = require('chalk');
const logger = require('loglevel');
const prefix = require('loglevel-plugin-prefix');
const colors = {
    TRACE: chalk.magenta,
    DEBUG: chalk.cyan,
    INFO: chalk.blue,
    WARN: chalk.yellow,
    ERROR: chalk.red
}
prefix.reg(logger);
logger.enableAll();
prefix.apply(logger, {
    format(level, name, timestamp) {
        return `${chalk.gray(`[${timestamp}]`)} ${colors[level.toUpperCase()](level + ":")}`;
    },
});
const Discord = require('discord.js');
const youtubedl = require('youtube-dl');
const ytsearch = require('youtube-search');
const YouTube = require('simple-youtube-api');
const request = require('request');
const crypto = require('crypto');
const fs = require('fs');
const client = new Discord.Client();
const apis = require('./config/apis.json');
const config = require('./config/config.json');
const emitter = require('events').EventEmitter;
const ytsearchopts = {
    maxResults: 1,
    key: apis.youtube
}
let loadingmsg = [];
let stopRequest = false;
let dispatcher;
let audioPlaying = false;
let statuses = [];
let playlistStatus = {
    "downloading": false,
    "remaining": 0
}
let vidQueue = [];
let loopEnabled = false;

if (!fs.existsSync('./cache')) {
    fs.mkdirSync('./cache');
}

let commands = {
    "help": config.cmdprefix + "help",
    "join": config.cmdprefix + "join",
    "leave": config.cmdprefix + "leave",
    "playlist": config.cmdprefix + "playlist",
    "play": config.cmdprefix + "play",
    "stop": config.cmdprefix + "stop",
    "loop": config.cmdprefix + "loop",
    "skip": config.cmdprefix + "skip",
    "shutdown": config.cmdprefix + "shutdown",
    "restart": config.cmdprefix + "restart",
    "resetstatus": config.cmdprefix + "resetstatus",
    "dumpqueue": config.cmdprefix + "dumpqueue"
}

client.on('ready', () => {
    fs.readFile('./config/statuses.txt', function(err, data) {
        if (err) throw err;
        statuses = data.toString().split("\n");
        resetSelf();
    });
    log('Logged in');
    if (config.devMode) {
        log('Bot running in development mode!', 'warn');
        client.user.setStatus('dnd');
    }
    let guilds = client.guilds.keyArray();
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }
    guilds.forEach(function (item, index) {
        if (!fs.existsSync('./data/' + item)) {
            fs.mkdirSync('./data/' + item);
            log('Created data folder for guild ' + item, 'debug');
        }
        if (!fs.existsSync('./cache/' + item)) {
            fs.mkdirSync('./cache/' + item);
            log('Created cache folder for guild ' + item, 'debug');
        }
    });
});

client.on('message', msg => {

    let datadir = "./data/" + msg.guild.id + "/";
    let cachedir = "./cache/" + msg.guild.id + "/";

    if (msg.member === null) {
        return;
    }

    let voiceChnl = msg.member.voiceChannel;

    if (msg.content.startsWith(config.cmdprefix)) {
        log(`${chalk.gray(`(${msg.guild.id})`)} Command ${chalk.bgCyan(chalk.black(msg.content))} executed by user ${chalk.bgGreen(chalk.black(`${msg.member.user.tag} (${msg.member.user.id})`))}`, 'debug');
    }

    // Help information
    if (msg.content.startsWith(commands.help)) {
        let args = msg.content.split(" ");
        if (args[1] === undefined) {
            msg.channel.send("```\nCommand Usage:\n\n" + commands.help + " <other command> : Get help for another command.\n```");
        }
    }

    // Join voice channel
    else if (msg.content.startsWith(commands.join)) {
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

    // Playlist handling
    else if (msg.content.startsWith(commands.playlist)) {
        if (!fs.existsSync(datadir + "playlists")) {
            fs.mkdirSync(datadir + "playlists");
        }
        let args = msg.content.split(" ");

        // Display command help
        if (args[1] === undefined) {
            let helptext = "```\nCommand Usage:\n\n";
            helptext += commands.playlist + " create <playlist name> : Creates a playlist with the specified name if it doesn't exist.\n";
            helptext += commands.playlist + " delete <playlist name> : Deletes a playlist with the specified name if it exists.\n";
            helptext += commands.playlist + " add <playlist name> <video url> : Adds a YouTube video to the specified playlist.\n";
            helptext += commands.playlist + " remove <playlist name> <video url> : Removes all instances of a video from the specified playlist.\n";
            helptext += commands.playlist + " import <youtube playlist url> <new playlist name> : Imports a YouTube playlist and creates a new playlist with it.\n";
            helptext += commands.playlist + " play <playlist name> : Plays the specified playlist in normal order.\n";
            helptext += commands.playlist + " mix <playlist name> : Plays the specified playlist in random order.\n";
            helptext += commands.playlist + " list : Lists all playlists on this Discord server.\n";
            let helplineend = "```";
            helptext += helplineend;
            msg.channel.send(helptext);
        }

        // Create new playlist
        else if (args[1] === "create") {
            let playlistName = args[2];
            if (fs.existsSync(datadir + "playlists/" + playlistName + '.json')) {
                msg.channel.send("Error: Playlist `" + playlistName + "` already exists.");
            } else {
                let playlistinfo = {
                    "name": playlistName,
                    "creator": msg.author.id,
                    "size": 0,
                    "videos": []
                }
                fs.writeFile(datadir + "playlists/" + playlistName + ".json", JSON.stringify(playlistinfo, "", " "), (err) => {
                    if (err) throw err;
                    log(`${chalk.gray(`(${msg.guild.id})`)} Playlist ${chalk.cyan(playlistName)} created.`);
                    msg.channel.send("Playlist `" + playlistName + "` successfully created. Add things to it with " + config.cmdprefix + "playlist add " + playlistName + " `video url`");
                });
            }
        }

        // Delete playlist
        else if (args[1] === "delete") {
            let playlistName = args[2];
            if (!fs.existsSync(datadir + "playlists/" + playlistName + '.json')) {
                msg.channel.send("Error: Playlist `" + playlistName + "` does not exist.");
            } else {
                fs.unlink(datadir + "playlists/" + playlistName + '.json', (err) => {
                    if (err) throw err;
                    log(`${chalk.gray(`(${msg.guild.id})`)} Deleted playlist ${chalk.cyan(playlistName)}.`);
                    msg.channel.send("Playlist `" + playlistName + "` was successfully deleted.");
                })
            }
        }

        // Add items to a playlist
        else if (args[1] === "add") {
            let playlistName = args[2];
            if (!fs.existsSync(datadir + "playlists/" + playlistName + '.json')) {
                msg.channel.send("Error: Playlist `" + playlistName + "` does not exist.");
            } else {
                let videoUrl = args[3];
                if (videoUrl.startsWith("https://youtube.com/watch?v=") || videoUrl.startsWith("https://www.youtube.com/watch?v=") || videoUrl.startsWith("https://youtu.be/")) {
                    fs.readFile(datadir + "playlists/" + playlistName + ".json", 'utf8', function (err, data) {
                        if (err) throw err;
                        let requestedPlaylist = JSON.parse(data);
                        let videos = requestedPlaylist.videos;
                        let size = requestedPlaylist.size;
                        size++;
                        videos.push(videoUrl);
                        requestedPlaylist.videos = videos;
                        requestedPlaylist.size = size;
                        fs.writeFile(datadir + "playlists/" + playlistName + '.json', JSON.stringify(requestedPlaylist, "", " "), (err) => {
                            if (err) throw err;
                            log(`${chalk.bgGreen(chalk.black(msg.author.tag))} added ${chalk.yellow(videoUrl)} to the ${chalk.red(playlistName)} playlist.`);
                            msg.channel.send(msg.author.username + " added " + videoUrl + " to the `" + playlistName + "` playlist.");
                        });
                    });
                } else {
                    msg.channel.send("Error: Only YouTube links are supported.");
                }
            }
        }

        // Remove items from a playlist
        else if (args[1] === "remove") {
            let playlistName = args[2];
            if (!fs.existsSync(datadir + "playlists/" + playlistName + '.json')) {
                msg.channel.send("Error: Playlist `" + playlistName + "` does not exist.");
            } else {
                let videoUrl = args[3];
                let getYtId = require('get-youtube-id');
                let requestedId = getYtId(videoUrl);
                if (videoUrl.startsWith("https://youtube.com/watch?v=") || videoUrl.startsWith("https://www.youtube.com/watch?v=") || videoUrl.startsWith("https://youtu.be/")) {
                    fs.readFile(datadir + "playlists/" + playlistName + ".json", 'utf8', function (err, data) {
                        if (err) throw err;
                        let requestedPlaylist = JSON.parse(data);
                        let videos = requestedPlaylist.videos;
                        let newvids = []
                        videos.forEach(element => {
                            if (getYtId(element) !== requestedId) {
                                newvids.push(element);
                            }
                        });
                        requestedPlaylist.videos = newvids;
                        let newsize = newvids.length;
                        requestedPlaylist.size = newsize;
                        fs.writeFile(datadir + "playlists/" + playlistName + '.json', JSON.stringify(requestedPlaylist, "", " "), (err) => {
                            if (err) throw err;
                            log(`${chalk.gray(`(${msg.guild.id})`)} ${chalk.bgGreen(chalk.black(msg.author.tag))} removed ${chalk.yellow(videoUrl)} from the ${chalk.red(playlistName)} playlist.`);
                            msg.channel.send(msg.author.username + " removed " + videoUrl + " from the `" + playlistName + "` playlist.");
                        });
                    });
                } else {
                    msg.channel.send("Error: Only YouTube links are supported.");
                }
            }
        }


        // Import playlist from YouTube
        else if (args[1] === "import") {
            let playlistUrl = args[2];
            let playlistName = args[3];
            if (fs.existsSync(datadir + "playlists/" + playlistName + '.json')) {
                msg.channel.send("Error: Playlist `" + playlistName + "` already exists.");
            } else {
                let youtube = new YouTube(apis.youtube);
                youtube.getPlaylist(playlistUrl).then(playlist => {
                    log(`${chalk.gray(`(${msg.guild.id})`)} Importing playlist...`);
                    notifyProcessing(msg.channel, "Importing playlist...");
                    playlist.getVideos().then(videos => {
                        let links = [];
                        videos.forEach(element => {
                            let link = "https://youtu.be/" + element.channel.raw.snippet.resourceId.videoId;
                            links.push(link);
                        });
                        let playlistinfo = {
                            "name": playlistName,
                            "creator": msg.author.id,
                            "size": links.length,
                            "videos": links
                        }
                        fs.writeFile(datadir + "playlists/" + playlistName + '.json', JSON.stringify(playlistinfo, "", " "), (err) => {
                            if (err) throw err;
                            log(`${chalk.gray(`(${msg.guild.id})`)} Playlist imported`);
                            stopNotifyProcessing();
                            let embed = new Discord.RichEmbed();
                            embed.setColor("#FF0000");
                            embed.setTitle("Playlist successfully imported!");
                            embed.addField("Name", playlistinfo.name, true);
                            embed.addField("Size", playlistinfo.size, true);
                            msg.channel.send(embed);
                        });
                    }).catch(err => {
                        log(err, 'err');
                    });
                });
            }
        }

        // Play playlist in order
        else if (args[1] === "play") {
            stopRequest = false;
            if (args[2] != undefined) {
                notifyProcessing(msg.channel);
                fs.readFile(datadir + "playlists/" + args[2] + ".json", 'utf8', function (err, data) {
                    if (err) throw err;
                    let requestedPlaylist = JSON.parse(data);
                    queuePlaylist(requestedPlaylist.videos, msg);
                });
            }

        }

        // Play playlist in random order
        else if (args[1] === "mix") {
            stopRequest = false;
            if (args[2] != undefined) {
                notifyProcessing(msg.channel);
                fs.readFile(datadir + "playlists/" + args[2] + ".json", 'utf8', function (err, data) {
                    if (err) throw err;
                    let requestedPlaylist = JSON.parse(data);
                    let shuffle = require('shuffle-array');
                    let processedArray = requestedPlaylist.videos;
                    shuffle(processedArray);
                    queuePlaylist(processedArray, msg);
                });
            }
        }

        // List playlists
        else if (args[1] === "list") {
            fs.readdir(datadir + "playlists", function (err, files) {
                if (err) log(err, 'err');
                let playlists = [];
                files.forEach(function (file) {
                    let name = file.replace('.json', '');
                    playlists.push(name);
                });
                if (playlists.length > 0) {
                    msg.channel.send("Playlists on this server:\n" + playlists);
                } else {
                    msg.channel.send("There are no playlists on this server. Create or import one.");
                }
            })
        }

    }

    // Play music
    else if (msg.content.startsWith(commands.play)) {
        stopRequest = false;
        if (playlistStatus.downloading) {
            msg.channel.send("A playlist is currently downloading in the queue, please do /stop if you want to play something else at this time, or wait for the current playlist to be completely added to the queue. Videos remaining to be downloaded: " + playlistStatus.remaining);
        } else if (msg.content.length <= commands.play.length) {
            if (msg.attachments.array().length > 0) {
                if (msg.attachments.first().filename.endsWith(".mp3") || msg.attachments.first().filename.endsWith(".wav") || msg.attachments.first().filename.endsWith(".flac") || msg.attachments.first().filename.endsWith(".ogg")) {
                    queueVideo(msg.attachments.first().url, msg, true, msg.attachments.first());
                } else {
                    msg.channel.send("I can only play mp3, wav, flac, and ogg files right now. Convert your file to one of those types and try again.");
                }
            } else {
                let helptext = "```\nCommand Usage:\n\n";
                helptext += commands.play + " <youtube search term> : Searches for and plays the first YouTube result.\n";
                helptext += commands.play + " <youtube video url> : Plays the specified YouTube url.\n";
                helptext += "\nUploading an audio file to Discord and putting " + commands.play + " in the comment will play the uploaded audio file.\n";
                let helplineend = "```";
                helptext += helplineend;
                msg.channel.send(helptext);
            }
        } else {
            notifyProcessing(msg.channel);
            let ytlink = msg.content.substring(commands.play.length + 1);
            if (!ytlink.startsWith("https://www.youtube.com/watch?v=") && !ytlink.startsWith("https://youtu.be/")) {
                let newQuery = ytlink;
                if (newQuery.startsWith("http")) {
                    // TODO: Handle invalid link
                } else { // Search YouTube
                    searchYoutube(newQuery, msg, function (link) {
                        queueVideo(link, msg, false);
                    });
                }
            } else {
                queueVideo(ytlink, msg, false);
            }
        }
    }

    // Stop playing music
    else if (msg.content.startsWith(commands.stop)) {
        if (audioPlaying) {
            vidQueue = []; // Clear queue
            stopRequest = true; // Signal a stop request to currently running functions
            dispatcher.end("Requested to stop.");
            resetSelf(msg.guild);
        }
    }

    // Toggle loop on/off
    else if (msg.content.startsWith(commands.loop)) {
        if (audioPlaying) {
            if (loopEnabled) {
                loopEnabled = false;
            } else {
                loopEnabled = true;
            }
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
        log("Shutdown request received.");
        resetSelf(msg.guild);
        msg.channel.send("Goodbye! Miss you already! :heart:");
        client.destroy();
    }

    // Restart bot
    else if (msg.content.startsWith(commands.restart)) {
        log("Restart request received.");
        msg.channel.send("Restarting...");
        client.destroy().then(status => {
            client.login(apis.discord);
        });
    }

    // Reset status (for debug purposes)
    else if (msg.content.startsWith(commands.resetstatus)) {
        resetSelf();
    }

    // Dump song queue to file (for debug purposes)
    else if (msg.content.startsWith(commands.dumpqueue)) {
        fs.writeFile(datadir + "queuedump.json", JSON.stringify(vidQueue, "", " "), function (err) {
            if (err) throw err;
        });
    }

    // Delete messages containing commands
    if (msg.content.startsWith(config.cmdprefix) && msg.attachments.array().length == 0) {
        msg.delete().then(msg => {}).catch(console.error);
    }
});

function searchYoutube(query, msg, cb) {
    log(`${chalk.gray(`(${msg.guild.id})`)} YouTube search query was ${chalk.yellow(query)}`);
    ytsearch(query, ytsearchopts, function (err, results) {
        if (err) return log(err, 'err');
        cb(results[0].link);
    })
}

function playVideo(videoData) {
    let voiceChnl = videoData.voiceChannel;
    if (voiceChnl != undefined) {
        voiceChnl.join().then(connection => {
            audioPlaying = true;
            sendNowPlayingEmbed(videoData);
            decodeBase64AudioStream(videoData.audiostream, videoData.msg, function (decodedData) {
                dispatcher = connection.playStream(decodedData, {
                    volume: config.audioVolume
                });
            });
            client.user.setActivity(videoData.title);
            dispatcher.on("end", () => {
                if (loopEnabled) {
                    playVideo(videoData);
                } else {
                    if (queueEmpty()) {
                        videoData.responseChannel.send("Queue is empty. Disconnecting.");
                        voiceChnl.leave();
                        resetSelf()
                        audioPlaying = false;
                    } else {
                        let nextVideo = vidQueue.shift();
                        playVideo(nextVideo);
                    }
                }
            })
        }).catch(console.error);
    }
}

function queueEmpty() {
    return vidQueue.length <= 0;
}

function queuePlaylist(linksarray, msg, echofull = true) {
    let cachedir = "./cache/" + msg.guild.id + "/";
    // If there are no more videos to queue
    if (linksarray.length == 0 && !stopRequest) {
        playlistStatus.downloading = false;
        playlistStatus.remaining = 0;
        log(`${chalk.gray(`(${msg.guild.id})`)} All playlist videos have been loaded.`);
    } else if (stopRequest) {
        linksarray = [];
        playlistStatus.downloading = false;
        playlistStatus.remaining = 0;
    }

    // If the queue is full, wait 15 seconds to see if a slot frees up, then try again
    else if (vidQueue.length >= config.maxQueueSize) {
        if (echofull) log(`${chalk.gray(`(${msg.guild.id})`)} Queue is full, checking every 5 seconds for a free slot.`);
        setTimeout(queuePlaylist, 5000, linksarray, msg, false);
    }

    // Queue a playlist video
    else {
        playlistStatus.downloading = true;
        playlistStatus.remaining = linksarray.length;
        log(`${chalk.gray(`(${msg.guild.id})`)} Downloading next playlist video... (${linksarray.length} videos left)`);
        let currentvid = linksarray.shift();
        youtubedl.getInfo(currentvid, function (err, data) {
            let video = youtubedl(currentvid);
            video.pipe(fs.createWriteStream(cachedir + 'qtemp'));
            video.on('end', function () {
                log(`${chalk.gray(`(${msg.guild.id})`)} Video download complete!`);
                encodeBase64AudioStream(cachedir + 'qtemp', msg, function (encodedData) {
                    let queuer = "";
                    if (msg.member.nickname != null) {
                        queuer = msg.member.nickname;
                    } else {
                        queuer = msg.author.username;
                    }
                    let videoData = {
                        "source": "YouTube Playlist",
                        "audiostream": encodedData,
                        "title": data.title,
                        "uploader": data.uploader,
                        "length": data._duration_hms,
                        "thumbnail": data.thumbnail,
                        "url": data.webpage_url,
                        "queuer": queuer,
                        "msg": msg,
                        "queuerAvatar": msg.member.user.avatarURL,
                        "responseChannel": msg.channel,
                        "voiceChannel": msg.member.voiceChannel
                    }
                    stopNotifyProcessing();
                    if (stopRequest) {
                        // Do nothing
                    } else if (!audioPlaying) {
                        playVideo(videoData);
                    } else {
                        vidQueue.push(videoData);
                    }
                    queuePlaylist(linksarray, msg);
                });
            });
        });
    }
}

function queueVideo(link, msg, local, attachmentInfo = null, sendEmbed = true) {
    let cachedir = "./cache/" + msg.guild.id + "/";
    if (!local) {
        youtubedl.getInfo(link, function (err, data) {
            let video = youtubedl(link);
            video.pipe(fs.createWriteStream(cachedir + 'qtemp'));
            video.on('end', function () {
                log(`${chalk.gray(`(${msg.guild.id})`)} Video download complete!`);
                encodeBase64AudioStream(cachedir + 'qtemp', msg, function (encodedData) {
                    let queuer = "";
                    if (msg.member.nickname != null) {
                        queuer = msg.member.nickname;
                    } else {
                        queuer = msg.author.username;
                    }
                    let videoData = {
                        "source": "YouTube",
                        "audiostream": encodedData,
                        "title": data.title,
                        "uploader": data.uploader,
                        "length": data._duration_hms,
                        "thumbnail": data.thumbnail,
                        "url": data.webpage_url,
                        "queuer": queuer,
                        "msg": msg,
                        "queuerAvatar": msg.member.user.avatarURL,
                        "responseChannel": msg.channel,
                        "voiceChannel": msg.member.voiceChannel
                    }
                    stopNotifyProcessing();
                    if (!audioPlaying) {
                        playVideo(videoData, msg);
                    } else {
                        vidQueue.push(videoData);
                        if (sendEmbed) {
                            sendQueueEmbed(videoData);
                        }
                    }
                });
            });
        });
    } else {
        log(`${chalk.gray(`(${msg.guild.id})`)} Downloading audio attachment...`);
        let download = request(link).pipe(fs.createWriteStream(cachedir + 'qtemp'));
        download.on('finish', function () {
            let musicDuration = require('music-duration');
            let gethhmmss = require('gethhmmss');
            let length;
            musicDuration(cachedir + 'qtemp').then(duration => {
                length = gethhmmss(parseInt(duration));
                msg.delete();
                encodeBase64AudioStream(cachedir + 'qtemp', msg, function (encodedData) {
                    let queuer = "";
                    if (msg.member.nickname != null) {
                        queuer = msg.member.nickname;
                    } else {
                        queuer = msg.author.username;
                    }
                    let videoData = {
                        "source": "Uploaded Audio",
                        "audiostream": encodedData,
                        "title": attachmentInfo.filename,
                        "uploader": queuer,
                        "length": length,
                        "thumbnail": undefined,
                        "url": link,
                        "queuer": queuer,
                        "msg": msg,
                        "queuerAvatar": msg.member.user.avatarURL,
                        "responseChannel": msg.channel,
                        "voiceChannel": msg.member.voiceChannel
                    }
                    if (!audioPlaying) {
                        playVideo(videoData, msg);
                    } else {
                        vidQueue.push(videoData);
                        sendQueueEmbed(videoData)
                    }
                });
            });
        });
    }
}

function sendQueueEmbed(data) {
    let embed = new Discord.RichEmbed();
    embed.setColor("#FF0000");
    embed.setTitle(data.source);
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
    embed.setTitle(data.source);
    embed.setDescription("Playing video requested by " + data.queuer);
    embed.setThumbnail(data.queuerAvatar);
    embed.addField("Video", data.title);
    embed.addField("Uploader", data.uploader, true);
    embed.addField("Length", data.length, true);
    embed.setImage(data.thumbnail);
    embed.setURL(data.url);
    data.responseChannel.send(embed);
}

function encodeBase64AudioStream(audioFilePath, msg, cb) {
    log(`${chalk.gray(`(${msg.guild.id})`)} Encoding audio to base64...`);
    fs.readFile(audioFilePath, function (err, data) {
        let binaryData = data;
        let base64Data = Buffer.from(binaryData, 'binary').toString('base64');
        cb(base64Data);
    });
}

function decodeBase64AudioStream(base64AudioStream, msg, cb) {
    log(`${chalk.gray(`(${msg.guild.id})`)} Decoding base64 audio stream...`);
    let base64Data = base64AudioStream;
    let binaryData = Buffer.from(base64Data, 'base64');
    const Readable = require('stream').Readable;
    const s = new Readable();
    s._read = () => {};
    s.push(binaryData);
    s.push(null);
    cb(s);
}

function notifyProcessing(channel, customMessage = "Processing...") {
    channel.send(customMessage).then(msg => loadingmsg.push(msg));
}

function stopNotifyProcessing() {
    //loadingmsg.shift().delete();
}

function resetSelf() {
    if (config.devMode) {
        client.user.setActivity("Development Mode");
    } else {
        client.user.setActivity(statuses[Math.floor((Math.random() * statuses.length))]);
    }
}

function log(message, loglevel = 'info') {
    if (loglevel.toLowerCase() === 'debug' && (config.devMode || config.loglevel === 0)) {
        logger.debug(message);
    } else {
        switch (loglevel.toLowerCase()) {
            case 'info':
                logger.info(message);
                break;
            case 'warn':
                logger.warn(message);
                break;
            case 'err':
                logger.error(message);
                break;
        }
    }
}

client.login(apis.discord);