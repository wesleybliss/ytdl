'use strict'

/*const FfmpegCommand = require('fluent-ffmpeg')
const ffmpeg = */
const path = require('path')
//const ffmpeg = require('fluent-ffmpeg')
const ffmpeg = require('ffmpeg')
const spawn = require('child_process').spawn


const getFileName = videoPath => {
    const dir = path.dirname(videoPath)
    const file = path.basename(videoPath)
    const extPos = path.extname(videoPath).length
    const extOffset = file.length - extPos
    return path.join(dir, file.substring(0, extOffset) + '.mp3')
}

const convert_OLD1 = (filePath, handlers) => new Promise((resolve, reject) => {
    
    if (handlers) {
        
        if (typeof handlers !== 'object')
            throw 'handlers must be an object'
        
        let restrictedHandlers = ['error', 'end']
        
        for (let k in handlers) {
            if (restrictedHandlers.includes(k))
                return reject(`handler "${k}" is not allowed`)
            if (typeof handlers[k] !== 'function')
                return reject(`handler "${k}" must be a function`)
        }
        
    }
    
    // Main FFMpeg job
    var job
    const tenMinutes = 60 * 10
    const audioFileName = getFileName(filePath)
    
    const handleEvent = (evt, params) => {
        if (handlers.hasOwnProperty(evt)) {
            try { handlers[evt](params) }
            catch (e) { console.warn(e) }
        }
    }
    
    function finish() {
        //console.warn('kill job', job)
        try {
            job.kill()
            job = null
        }
        catch (e) {
            console.warn('failed to kill job', job)
        }
        resolve({ job, audioFileName })
    }
    
    const opts = {
        source: filePath,
        timeout: tenMinutes,
    }
    
    job = ffmpeg(opts)
        .audioBitrate('320k')
        .audioChannels(2)
        .audioCodec('libmp3lame')
        .audioQuality(0)
        .on('error', err => reject(err))
        .on('end', () => { finish() })
        .on('progress', params => handleEvent('progress', params))
        .on('stderr', params => handleEvent('stderr', params))
        
    job
        .toFormat('mp3')
        .saveToFile(audioFileName)
        /*.output(audioFileName)
        .run()*/
    
    // Process sometimes just hangs after completion
    //setTimeout(finish, (tenMinutes + 10))
    
})


const convert_OLD2 = filePath => new Promise((resolve, reject) => {
    
    try {
        
        new ffmpeg(filePath, (err, video) => {
            
            if (err) return reject(err)
            
            const destPath = getFileName(filePath)
            
            //video.setAudioCodec('libmp3lame')
            video.setAudioChannels(2)
            video.setAudioBitRate(320)
            //video.setAudioQuality(320)
            
            console.log('\nConvert\n    ' + filePath + '\n    ' + destPath)
            
            video.fnExtractSoundToMP3(destPath, (error, file) => {
                if (error) return reject(err)
                resolve(file)
            })
            
        })
        
    } catch (e) {
        reject(e)
    }
    
})


/**
 * Parse progress line from ffmpeg stderr
 *
 * @param {String} line progress line
 * @return progress object
 * @private
 */
const parseProgressLine = line => {
    
    let progress = {}
    
    if (!line || (typeof line !== 'string'))
        return null
    
    // Remove all spaces after = and trim
    line = line.replace(/=\s+/g, '=').trim()
    let progressParts = line.split(' ')
    
    // Split every progress part by "=" to get key and value
    for (let i = 0; i < progressParts.length; i++) {
        
        let progressSplit = progressParts[i].split('=', 2)
        let key = progressSplit[0]
        let value = progressSplit[1]
        
        // This is not a progress line
        if (typeof value === 'undefined')
            return null
        
        progress[key] = value
        
    }
    
    return progress
    
}

/**
 * Extract progress data from ffmpeg stderr and emit 'progress' event if appropriate
 *
 * @param {FfmpegCommand} command event emitter
 * @param {String} stderrLine ffmpeg stderr data
 * @private
 */
const extractProgress = (command, stderrLine) => {
    
    let progress = parseProgressLine(stderrLine)
    
    if (progress) {
        
        // build progress report object
        var ret = {
            frames: parseInt(progress.frame, 10),
            currentFps: parseInt(progress.fps, 10),
            currentKbps: progress.bitrate ? parseFloat(progress.bitrate.replace('kbits/s', '')) : 0,
            targetSize: parseInt(progress.size || progress.Lsize, 10),
            timemark: progress.time
        }
        
        // calculate percent progress using duration
        if (command._ffprobeData && command._ffprobeData.format && command._ffprobeData.format.duration) {
            var duration = Number(command._ffprobeData.format.duration)
            if (!isNaN(duration))
                ret.percent = (utils.timemarkToSeconds(ret.timemark) / duration) * 100
        }
        
        command.emit('progress', ret)
        
    }
    
}


/**
 * Convert a [[hh:]mm:]ss[.xxx] timemark into seconds
 *
 * @param {String} timemark timemark string
 * @return Number
 * @private
 */
const timemarkToSeconds = timemark => {
    
    if (typeof timemark === 'number')
        return timemark
    
    if (timemark.indexOf(':') === -1 && timemark.indexOf('.') >= 0)
        return Number(timemark)
    
    let parts = timemark.split(':')
    
    // add seconds
    let secs = Number(parts.pop())
    
    if (parts.length) {
        // add minutes
        secs += Number(parts.pop()) * 60
    }
    
    if (parts.length) {
        // add hours
        secs += Number(parts.pop()) * 3600
    }
    
    return secs
    
}


const ffprobe = filePath => new Promise((resolve, reject) => {
    
    let proc = spawn('ffprobe', ['-show_streams', '-show_format', filePath])
    let info = ''
    
    proc.stdout.on('data', data => {
        info += data
    })
    
    proc.stderr.on('data', data => {
        //console.warn(data.toString())
        info += data
    })
    
    proc.on('close', code => {
        
        console.log(`child process exited with code ${code}`)
        
        let lines = info.split('\n').map(x => x.trim())
        
        //let timemark = lines.filter(x => x.includes())
        let duration = lines.filter(x => x.includes('duration='))
        
        if (duration && duration.length > 0) {
            
            duration = duration.pop().split('duration=').pop()
            
            console.info('\n\nDuration is', duration, '\n\n')
            
            duration = Number(duration)
            
        }
        else { console.error('invalid duration')}
        
        if (+code === 0) resolve(duration)
        else reject(code)
        
    })
    
})


const getPercent = (timemark, duration) =>
    (timemarkToSeconds(timemark) / duration) * 100


/*

High quality (VBR) audio rip
ffmpeg -i sample.avi -q:a 0 -map a sample.mp3

TF="Tesla Model 3 launch event in 5 minutes"; ffmpeg -i "$TF.mp4" -q:a 0 -map a "$TF.mp3"

*/

const _convert = (filePath, duration) => new Promise((resolve, reject) => {
    
    const destPath = getFileName(filePath)
    
    //['-i', 'pipe:0', '-f', 'mp3', '-ac', '2', '-ab', '128k', '-acodec', 'libmp3lame', 'pipe:1']
    
    const args = ['-i', filePath, '-q:a', '0', '-map', 'a', destPath]
    
    const exitHandler = (code, signal) => {
        console.log('child process exited with ' +
            `code ${code} and signal ${signal}`)
        resolve(destPath)
    }
    
    let proc = spawn('ffmpeg', args)
    
    proc.stdout.on('data', data => {
        console.log(`stdout: ${data}`)
    })
    
    proc.stderr.on('data', data => {
        
        let progress = null
        
        if (data && data.includes('time=')) {
            data = '' + data
            let timemark = data.split('time=').pop().split(' ').shift().trim()
            progress = getPercent(timemark, duration)
            console.log('\n\n', timemarkToSeconds(timemark), '/', duration, '\n\n')
        }
        
        if (progress)
            console.log('Progress: ', progress)
        else
            console.log(`stderr: ${data}`)
        
    })

    proc.on('close', exitHandler)
    //proc.on('exit', exitHandler)
    proc.on('error', err => console.error(err))
    
})


const convert = filePath => {
    return ffprobe(filePath)
        .then(duration => _convert(filePath, duration))
}


module.exports = convert