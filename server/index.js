const http = require('http')
const path = require('path')
const fse = require('fs-extra')
const multiparty = require('multiparty')

const server = http.createServer()
const UPLOAD_DIR = path.resolve(__dirname, 'target') // 大文件存储目录

const resolvePost = (req) => {
  return new Promise((resolve) => {
    let chunk = ''
    req.on('data', (data) => {
      chunk += data
    })
    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })
}

const pipeStream = (path, writeStream) => {
  return new Promise((resolve) => {
    const readStream = fse.createReadStream(path)
    readStream.on('end', () => {
      fse.unlinkSync(path)
      resolve()
    })
    readStream.pipe(writeStream)
  })
}

const mergeFileChunk = async (filePath, filename, size) => {
  const chunkDir = path.resolve(UPLOAD_DIR, filename + '_chunks')
  const chunkPaths = await fse.readdir(chunkDir)
  // 根据切片下标进行排序
  // 否则直接读取目录的获得的顺序可能会错乱
  chunkPaths.sort(
    (a, b) =>
      a.split('-')[a.split('-').length - 1] -
      b.split('-')[b.split('-').length - 1]
  )
  console.log('--- Splitting files into chunks... ---')
  console.log(chunkPaths)
  await Promise.all(
    chunkPaths.map((chunkPath, index) => {
      return pipeStream(
        path.resolve(chunkDir, chunkPath),
        // 指定位置创建可写流
        fse.createWriteStream(filePath, {
          start: index * size,
          end: (index + 1) * size
        })
      )
    })
  )
  console.log('--- Splitting finished! ---')
  console.log('--- Removing chunk dir... ---')
  fse.removeSync(chunkDir) // 合并后删除保存切片的目录
  console.log('--- Chunk dir removed! ---')
}

server.on('request', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') {
    res.status = 200
    res.end()
    return
  }

  if (req.url === '/') {
    const multipart = new multiparty.Form()
    multipart.parse(req, async (err, fields, files) => {
      if (err) return
      const [chunk] = files.chunk
      const [hash] = fields.hash
      const [filename] = fields.filename
      const chunkDir = path.resolve(UPLOAD_DIR, filename + '_chunks')

      // 如果切片目录不存在就创建切片目录
      if (!fse.existsSync(chunkDir)) await fse.mkdirs(chunkDir)

      await fse.move(chunk.path, `${chunkDir}/${hash}`)

      res.end('文件切片已接收')
    })
  }

  if (req.url === '/merge') {
    const data = await resolvePost(req)
    const { filename, size } = data
    const filePath = path.resolve(UPLOAD_DIR, filename)
    await mergeFileChunk(filePath, filename, size)
    res.end(
      JSON.stringify({
        code: 0,
        message: 'file merged success'
      })
    )
  }
})

server.listen(3000, console.log('Port: 3000'))
