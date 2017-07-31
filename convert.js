'use strict'

/*const FfmpegCommand = require('fluent-ffmpeg')
const ffmpeg = */
const path = require('path')
const ffmpeg = require('fluent-ffmpeg')


const getFileName = videoPath => {
    const dir = path.dirname(videoPath)
    const file = path.basename(videoPath)
    const extPos = path.extname(videoPath).length
    const extOffset = file.length - extPos
    return path.join(dir, file.substring(0, extOffset) + '.mp3')
}

const convert = (filePath, handlers) => new Promise((resolve, reject) => {
    
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


module.exports = convert