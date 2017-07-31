'use strict'

const promisify = require('./promisify')
const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const mkdirp = promisify(require('mkdirp'))
const readFile = promisify(fs.readFile)
const sanitizeFilename = require('sanitize-filename')
const convert = require('./convert')

//curl http://www.youtube.com/get_video_info\?video_id\=6uK6BIVzcxU

const getTempFileName = ext => path.join(__dirname, `temp/dl-${Date.now()}.${ext}`)

// @todo Make this name pull from the video's title
const getVideoFileName = (videoId, ext) => {
    return path.join(__dirname, `videos/${videoId}.${ext}`)
}

const getFileExt = (url, fileExt) => {
    
    let name = path.basename(url)
    let ext = path.extname(name)
    
    // Allow manual override
    if (fileExt) ext = fileExt
    
    if (ext.startsWith('.'))
        ext = ext.substring(1)
    
    return getTempFileName(ext)
    
}

const urlHasFileName = url => {
    try { return path.basename(url) != '' }
    catch (e) { return false }
}

// @todo progress? https://gist.github.com/LiamKarlMitchell/027b77b9e80ab518c23dd423963cbcda
const downloadInMemory = url => new Promise((resolve, reject) => {
    
    let data = ''
    const client = url.startsWith('https://') ? https : http
    
    const request = client.get(url, res => {
        
        // Follow redirects
        if ( [301, 302].indexOf(res.statusCode) > -1 )
            return downloadInMemory(res.headers.location)
        
        res.on('error', err => reject(err))
        res.on('data', chunk => { data += chunk })
        res.on('end', () => resolve(data))
        
    })
    
})

const downloadFile = (url, dir, fileExt, customFileName) => new Promise((resolve, reject) => {
    
    let fileName
    
    // Allow user to manually specify a filename
    if (customFileName && customFileName.length > 0) {
        if (!fileExt || fileExt.length < 1)
            return reject('custom filename provided without file extension')
        fileName = `${customFileName}.${fileExt}`
    }
    else {
        fileName = urlHasFileName(url)
            ? path.join(__dirname, 'temp/' + path.basename(url))
            : getTempFileName(getFileExt(url, fileExt))
    }
    
    fileName = sanitizeFilename(fileName)
    fileName = path.join(dir, fileName)
    
    const ws = fs.createWriteStream(fileName)
    const client = url.startsWith('https://') ? https : http
    
    console.info(`Downloading ${fileName} from ${url}`)
    
    const request = client.get(url, res => {
        res.on('error', err => reject(err))
        res.on('data', data => ws.write(data))
        res.on('end', () => {
            ws.close()
            resolve(fileName)
        })
    })
    
})


const start = () => {
    
    const vidPath = path.resolve(__dirname, 'videos/Tesla Model 3 launch event in 5 minutes.mp4')
    convert(vidPath, {
        /*stderr: line => console.error(line),*/
        progress: info => console.info(info.percent, '%')
    })
    .then(({ job, audioFileName }) => {
        try { job.kill() }
        catch (e) { console.warn(e) }
        console.info('saved to', audioFileName)
    })
    .then(() => { process.exit() })
    .catch(err => console.error(err))
    
}

const start_TEMP = () => {
    
    const videoId = '6uK6BIVzcxU'
    const url = `http://www.youtube.com/get_video_info?video_id=${videoId}`
    
    downloadInMemory(url, 'json')
        .then(data => parseVideoInfo(data))
        /* @todo Assuming mp4 here, but really should detect it */
        .then(info => downloadFile(
            info.video.url,                     // Url
            path.resolve(__dirname, 'videos'),  // Output path
            'mp4',                              // Extension
            info.title                          // Filename
        ))
        .catch(err => console.error(err))
    
}

const parseVideoInfo = data => new Promise((resolve, reject) => {
    
    let raw = data.split('&')
    let title = 'Unknown'
    
    data = {}
    
    raw.forEach(d => {
        d = d.split('=')
        const [k, v] = d
        data[k] = v
    })
    
    if (data.hasOwnProperty('title'))
        title = decodeURIComponent(data.title).replace(/\+/g,' ')
    
    if (!data.hasOwnProperty('url_encoded_fmt_stream_map'))
        return reject('Can\'t find \'url_encoded_fmt_stream_map\'')
    
    // Grab the main video info param, which should be the line
    // containing the "itag" key + other required params
    let info = decodeURIComponent(data.url_encoded_fmt_stream_map)
    
    // info is now a CSV string of querystrings
    
    let formats = info.split(',')
    console.info('Found', formats.length, 'formats')
    
    formats = formats.map(f => {
        
        // *Important* Split _before_ decoding, otherwise all of the
        // params in the `url` key will be flat mapped back onto format
        f = f.split('&')
        
        // This since 'format' is now an array of querystring (k=v) items
        let params = {}
        f.forEach(qs => {
            const [k, v] = qs.split('=')
            params[k] = decodeURIComponent(v)
        })
        
        return params
        
    })
    
    //formats.forEach(f => console.log(f.quality))
    
    // @todo For now, try to grab 720p, otherwise whatever is the first one
    // later, should allow choosing a quality preference
    
    let video
    let hd720 = formats.filter(f => f.quality === 'hd720')
    
    // Each format entry is still a single-element array,
    // so we just need to grab the zero index
    if (hd720 && hd720.length > 0)
        video = hd720[0]
    else
        video = formats.shift()[0]
    
    resolve({ title, video })
    
})


Promise.all([
    mkdirp(path.join(__dirname, 'temp')),
    mkdirp(path.join(__dirname, 'videos'))
])
.then(() => start())