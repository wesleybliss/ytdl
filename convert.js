'use strict'

const path = require('path')
const spawn = require('child_process').spawn


const getFileName = videoPath => {
    const dir = path.dirname(videoPath)
    const file = path.basename(videoPath)
    const extPos = path.extname(videoPath).length
    const extOffset = file.length - extPos
    return path.join(dir, file.substring(0, extOffset) + '.mp3')
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
        let duration = lines.filter(x => x.includes('duration='))
        
        if (duration && duration.length > 0) {
            duration = duration.pop().split('duration=').pop()
            duration = Number(duration)
        }
        
        if (+code === 0) resolve(duration)
        else reject(code)
        
    })
    
})

const getPercent = (timemark, duration) =>
    (timemarkToSeconds(timemark) / duration) * 100

const _convert = (filePath, duration) => new Promise((resolve, reject) => {
    
    const destPath = getFileName(filePath)
    const args = ['-i', filePath, '-q:a', '0', '-map', 'a', destPath]
    
    const exitHandler = (code, signal) => {
        console.log('child process exited with ' +
            `code ${code} and signal ${signal}`)
        resolve(destPath)
    }
    
    let proc = spawn('ffmpeg', args)
    
    proc.stdout.on('data', data => console.log(`stdout: ${data}`))
    
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
