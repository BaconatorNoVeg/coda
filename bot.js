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
    "join": config.cmdprefix + "join",
    "leave": config.cmdprefix + "leave",
    "playlist": config.cmdprefix + "playlist",
    "play": config.cmdprefix + "play",
    "stop": config.cmdprefix + "stop",
    "loop": config.cmdprefix + "loop",
    "skip": config.cmdprefix + "skip",
    "shutdown": config.cmdprefix + "shutdown",
    "restart": config.cmdprefix + "restart",
    "dumpqueue": config.cmdprefix + "dumpqueue"
}

client.on('ready', () => {
    console.log('Logged in');
    let guilds = client.guilds.keyArray();
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }
    guilds.forEach(function (item, index) {
        if (!fs.existsSync('./data/' + item)) {
            fs.mkdirSync('./data/' + item);
        }
        if (!fs.existsSync('./cache/' + item)) {
            fs.mkdirSync('./cache/' + item);
        }
    });
});

client.on('message', msg => {

    let datadir = "./data/" + msg.guild.id + "/";
    let cachedir = "./cache/" + msg.guild.id + "/";

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

    // Playlist handling
    else if (msg.content.startsWith(commands.playlist)) {
        if (!fs.existsSync(datadir + "playlists")) {
            fs.mkdirSync(datadir + "playlists");
        }
        let args = msg.content.split(" ");

        // Create new playlist
        if (args[1] === "create") {
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
                    console.log("Playlist " + playlistName + " created.");
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
                    console.log("Deleted playlist " + playlistName);
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
                            console.log(msg.author.id + " added " + videoUrl + " to playlist " + playlistName);
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
                            console.log(msg.author.id + " removed " + videoUrl + " from playlist " + playlistName);
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
                    console.log('Importing playlist...');
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
                            console.log("Playlist imported");
                            stopNotifyProcessing();
                            let embed = new Discord.RichEmbed();
                            embed.setColor("#FF0000");
                            embed.setTitle("Playlist successfully imported!");
                            embed.addField("Name", playlistinfo.name, true);
                            embed.addField("Size", playlistinfo.size, true);
                            msg.channel.send(embed);
                        });
                    }).catch(err => {
                        console.log(err);
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
                if (err) console.log(err);
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
                queueVideo(msg.attachments.first().url, msg, true);
            } else {
                // TODO: Handle invalid command
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

    // Dump song queue to file (for debug purposes)
    else if (msg.content.startsWith(commands.dumpqueue)) {
        fs.writeFile(datadir + "queuedump.json", JSON.stringify(vidQueue, "", " "), function (err) {
            if (err) throw err;
        });
    }

    // Delete messages containing commands
    // if (msg.content.startsWith(config.cmdprefix) && msg.attachments.array().length == 0) {
    //     msg.delete().then(msg => {}).catch(console.error);
    // }
});

function searchYoutube(query, msg, cb) {
    console.log("YouTube search query was '" + query + "'");
    ytsearch(query, ytsearchopts, function (err, results) {
        if (err) return console.log(err);
        cb(results[0].link);
    })
}

function playVideo(videoData) {
    let voiceChnl = videoData.voiceChannel;
    if (voiceChnl != undefined) {
        voiceChnl.join().then(connection => {
            audioPlaying = true;
            sendNowPlayingEmbed(videoData);
            decodeBase64AudioStream(videoData.audiostream, function (decodedData) {
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
                        client.user.setActivity("");
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
        console.log("All playlist videos have been loaded into RAM.");
    } else if (stopRequest) {
        linksarray = [];
        playlistStatus.downloading = false;
        playlistStatus.remaining = 0;
    }

    // If the queue is full, wait 15 seconds to see if a slot frees up, then try again
    else if (vidQueue.length >= config.maxQueueSize) {
        if (echofull) console.log("Queue is full, checking every 5 seconds for a free slot.");
        setTimeout(queuePlaylist, 5000, linksarray, msg, false);
    }

    // Queue a playlist video
    else {
        playlistStatus.downloading = true;
        playlistStatus.remaining = linksarray.length;
        console.log("Downloading next playlist video... (" + linksarray.length + " videos left)");
        let currentvid = linksarray.shift();
        youtubedl.getInfo(currentvid, function (err, data) {
            let video = youtubedl(currentvid);
            video.pipe(fs.createWriteStream(cachedir + 'qtemp'));
            video.on('end', function () {
                console.log("Video download complete!");
                encodeBase64AudioStream(cachedir + 'qtemp', function (encodedData) {
                    let queuer = "";
                    if (msg.member.nickname != null) {
                        queuer = msg.member.nickname;
                    } else {
                        queuer = msg.author.username;
                    }
                    let videoData = {
                        "audiostream": encodedData,
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

function queueVideo(link, msg, local, sendEmbed = true) {
    let cachedir = "./cache/" + msg.guild.id + "/";
    if (!local) {
        youtubedl.getInfo(link, function (err, data) {
            let video = youtubedl(link);
            video.pipe(fs.createWriteStream(cachedir + 'qtemp'));
            video.on('end', function () {
                console.log("Video download complete!");
                encodeBase64AudioStream(cachedir + 'qtemp', function (encodedData) {
                    let queuer = "";
                    if (msg.member.nickname != null) {
                        queuer = msg.member.nickname;
                    } else {
                        queuer = msg.author.username;
                    }
                    let videoData = {
                        "audiostream": encodedData,
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
                    stopNotifyProcessing();
                    if (!audioPlaying) {
                        playVideo(videoData);
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
        console.log("Downloading audio attachment...");
        let download = request(link).pipe(fs.createWriteStream(cachedir + 'qtemp'));
        download.on('finish', function () {
            msg.delete();
            encodeBase64AudioStream(cachedir + 'qtemp', function (encodedData) {
                let queuer = "";
                if (msg.member.nickname != null) {
                    queuer = msg.member.nickname;
                } else {
                    queuer = msg.author.username;
                }
                let videoData = {
                    "audiostream": encodedData,
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
            });
        });
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

function encodeBase64AudioStream(audioFilePath, cb) {
    console.log("Encoding audio to base64...");
    fs.readFile(audioFilePath, function (err, data) {
        let binaryData = data;
        let base64Data = Buffer.from(binaryData, 'binary').toString('base64');
        cb(base64Data);
    });
}

function decodeBase64AudioStream(base64AudioStream, cb) {
    console.log("Decoding base64 audio stream...");
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

function resetSelf(guild) {
    client.user.setActivity("");
    guild.members.get(client.user.id).setNickname("Coda");
}

client.login(apis.discord);