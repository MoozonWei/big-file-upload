<script setup>
  import { computed, reactive } from 'vue'

  const SIZE = 50 * 1024 * 1024 // 切片大小

  const container = reactive({
    file: null
  })
  const data = reactive([])
  const uploadPercentage = computed(() => {
    if (!container.file || !data.length) return 0
    const loaded = data
      .map((item) => item.chunk.size * item.percentage)
      .reduce((acc, cur) => acc + cur)
    const pct = parseInt(loaded / container.file.size)
    return pct
  })

  // File changed 事件响应
  const handleFileChange = function (e) {
    data.length = 0
    const [file] = e.target.files
    if (!file) return
    container.file = file
  }

  // Upload 事件响应
  const handleUpload = async function () {
    if (!container.file) return
    const fileChunkList = createFileChunk(container.file)
    // data.slice(0, data.length)
    data.length = 0
    data.push(
      ...fileChunkList.map(({ file }, index) => ({
        chunk: file,
        index,
        hash: `${container.file.name}-${index}`, // 文件名-数组下标
        percentage: 0
      }))
    )
    await uploadChunks()
  }

  // 请求函数
  const request = function ({
    url,
    method = 'post',
    data,
    headers = {},
    onProgress = (e) => e
    // requestList
  }) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()
      xhr.addEventListener('progress', onProgress)
      xhr.open(method, url)
      for (const key in headers) {
        xhr.setRequestHeader(key, headers[key])
      }
      xhr.onload = (e) => {
        resolve({ data: e.target.response })
      }
      xhr.send(data)
    })
  }

  // 生成文件切片
  const createFileChunk = function (file, size = SIZE) {
    const fileChunkList = []
    for (let i = 0; i < file.size; i += size) {
      fileChunkList.push({
        file: file.slice(i, i + size)
      })
    }
    return fileChunkList
  }

  // 上传切片
  const uploadChunks = async function () {
    const requestList = data
      .map(({ chunk, hash, index }) => {
        const formData = new FormData()
        formData.append('chunk', chunk)
        formData.append('hash', hash)
        formData.append('filename', container.file.name)
        return { formData, index }
      })
      .map(async ({ formData, index }) => {
        return request({
          url: 'http://localhost:3000',
          data: formData,
          onProgress: createProgressHandler(data[index])
        })
      })
    // 并发切片
    await Promise.all(requestList)
    // 请求合并
    // await new Promise((resolve) => {
    //   setTimeout(() => {
    //     resolve()
    //   }, 5000)
    // })
    await mergeRequest()
  }

  // 发送合并请求
  const mergeRequest = async function () {
    await request({
      url: 'http://localhost:3000/merge',
      headers: { 'content-type': 'application/json' },
      data: JSON.stringify({
        size: SIZE,
        filename: container.file.name
      })
    })
  }

  // 工厂函数为每个切片创建一个进度监听函数
  const createProgressHandler = function (item) {
    return (e) => {
      item.percentage = parseInt(String((e.loaded / e.total) * 100))
    }
  }
</script>

<template>
  <div
    class="bg-gray-100 flex flex-col justify-center items-center w-full min-h-full py-10"
  >
    <div class="bg-gray-50 rounded-xl p-6 shadow-lg">
      <input class="mr-8" type="file" name="" @change="handleFileChange" />
      <button
        class="bg-green-500 text-white p-2 rounded-lg text-lg hover:bg-green-800"
        @click="handleUpload"
      >
        upload
      </button>
    </div>
    <div
      class="bg-gray-50 w-[40rem] min-h-[4.25rem] shadow-lg rounded-xl mt-8 p-4 grid grid-cols-12 grid-rows-12 gap-4 grid-flow-row overflow-auto transition-all duration-200"
    >
      <div
        v-for="(item, index) in data"
        :key="index"
        class="bg-white shadow-lg rounded-lg aspect-square overflow-hidden flex items-end"
      >
        <div
          class="w-full bg-green-500 transition-all duration-200"
          :style="`height: ${item.percentage}%`"
        ></div>
      </div>
    </div>
    <div
      class="bg-gray-50 w-[40rem] h-10 shadow-lg rounded-xl mt-8 overflow-hidden"
    >
      <div
        class="inline-block h-full bg-green-500 transition-all duration-100"
        :style="`width: ${uploadPercentage}%`"
      ></div>
    </div>
    <span class="mt-2">{{ uploadPercentage }}%</span>
  </div>
</template>

<style lang="scss">
  :root,
  body,
  #app {
    @apply w-full h-full;
  }
</style>
