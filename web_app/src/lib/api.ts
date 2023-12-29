import { Filename, ModelInfo, PowerPaintTask, Rect } from "@/lib/types"
import { Settings } from "@/lib/states"
import { srcToFile } from "@/lib/utils"
import axios from "axios"

export const API_ENDPOINT = import.meta.env.VITE_BACKEND
  ? import.meta.env.VITE_BACKEND
  : ""

const api = axios.create({
  baseURL: API_ENDPOINT,
})

export default async function inpaint(
  imageFile: File,
  settings: Settings,
  croperRect: Rect,
  extenderState: Rect,
  mask: File | Blob,
  paintByExampleImage: File | null = null
) {
  const fd = new FormData()
  fd.append("image", imageFile)
  fd.append("mask", mask)
  fd.append("ldmSteps", settings.ldmSteps.toString())
  fd.append("ldmSampler", settings.ldmSampler.toString())
  fd.append("zitsWireframe", settings.zitsWireframe.toString())
  fd.append("hdStrategy", "Crop")
  fd.append("hdStrategyCropMargin", "128")
  fd.append("hdStrategyCropTrigerSize", "640")
  fd.append("hdStrategyResizeLimit", "2048")

  fd.append("prompt", settings.prompt)
  fd.append("negativePrompt", settings.negativePrompt)

  fd.append("useCroper", settings.showCropper ? "true" : "false")
  fd.append("croperX", croperRect.x.toString())
  fd.append("croperY", croperRect.y.toString())
  fd.append("croperHeight", croperRect.height.toString())
  fd.append("croperWidth", croperRect.width.toString())

  fd.append("useExtender", settings.showExtender ? "true" : "false")
  fd.append("extenderX", extenderState.x.toString())
  fd.append("extenderY", extenderState.y.toString())
  fd.append("extenderHeight", extenderState.height.toString())
  fd.append("extenderWidth", extenderState.width.toString())

  fd.append("sdMaskBlur", settings.sdMaskBlur.toString())
  fd.append("sdStrength", settings.sdStrength.toString())
  fd.append("sdSteps", settings.sdSteps.toString())
  fd.append("sdGuidanceScale", settings.sdGuidanceScale.toString())
  fd.append("sdSampler", settings.sdSampler.toString())

  if (settings.seedFixed) {
    fd.append("sdSeed", settings.seed.toString())
  } else {
    fd.append("sdSeed", "-1")
  }

  fd.append("sdMatchHistograms", settings.sdMatchHistograms ? "true" : "false")
  fd.append("sdScale", (settings.sdScale / 100).toString())
  fd.append("enableFreeu", settings.enableFreeu.toString())
  fd.append("freeuConfig", JSON.stringify(settings.freeuConfig))
  fd.append("enableLCMLora", settings.enableLCMLora.toString())

  fd.append("cv2Radius", settings.cv2Radius.toString())
  fd.append("cv2Flag", settings.cv2Flag.toString())

  // TODO: resize image's shortest_edge to 224 before pass to backend, save network time?
  // https://huggingface.co/docs/transformers/model_doc/clip#transformers.CLIPImageProcessor
  if (paintByExampleImage) {
    fd.append("paintByExampleImage", paintByExampleImage)
  }

  // InstructPix2Pix
  fd.append("p2pImageGuidanceScale", settings.p2pImageGuidanceScale.toString())

  // ControlNet
  fd.append("enable_controlnet", settings.enableControlnet.toString())
  fd.append(
    "controlnet_conditioning_scale",
    settings.controlnetConditioningScale.toString()
  )
  fd.append("controlnet_method", settings.controlnetMethod?.toString())

  // PowerPaint
  if (settings.showExtender) {
    fd.append("powerpaintTask", PowerPaintTask.outpainting)
  } else {
    fd.append("powerpaintTask", settings.powerpaintTask)
  }

  try {
    const res = await fetch(`${API_ENDPOINT}/inpaint`, {
      method: "POST",
      body: fd,
    })
    if (res.ok) {
      const blob = await res.blob()
      const newSeed = res.headers.get("X-seed")
      return { blob: URL.createObjectURL(blob), seed: newSeed }
    }
    const errMsg = await res.text()
    throw new Error(errMsg)
  } catch (error) {
    throw new Error(`Something went wrong: ${error}`)
  }
}

export function getServerConfig() {
  return fetch(`${API_ENDPOINT}/server_config`, {
    method: "GET",
  })
}

export function switchModel(name: string) {
  const fd = new FormData()
  fd.append("name", name)
  return fetch(`${API_ENDPOINT}/model`, {
    method: "POST",
    body: fd,
  })
}

export function currentModel() {
  return fetch(`${API_ENDPOINT}/model`, {
    method: "GET",
  })
}

export function fetchModelInfos(): Promise<ModelInfo[]> {
  return api.get("/models").then((response) => response.data)
}

export function modelDownloaded(name: string) {
  return fetch(`${API_ENDPOINT}/model_downloaded/${name}`, {
    method: "GET",
  })
}

export async function runPlugin(
  name: string,
  imageFile: File,
  upscale?: number,
  clicks?: number[][]
) {
  const fd = new FormData()
  fd.append("name", name)
  fd.append("image", imageFile)
  if (upscale) {
    fd.append("upscale", upscale.toString())
  }
  if (clicks) {
    fd.append("clicks", JSON.stringify(clicks))
  }

  try {
    const res = await fetch(`${API_ENDPOINT}/run_plugin`, {
      method: "POST",
      body: fd,
    })
    if (res.ok) {
      const blob = await res.blob()
      return { blob: URL.createObjectURL(blob) }
    }
    const errMsg = await res.text()
    throw new Error(errMsg)
  } catch (error) {
    throw new Error(`Something went wrong: ${error}`)
  }
}

export async function getMediaFile(tab: string, filename: string) {
  const res = await fetch(
    `${API_ENDPOINT}/media/${tab}/${encodeURIComponent(filename)}`,
    {
      method: "GET",
    }
  )
  if (res.ok) {
    const blob = await res.blob()
    const file = new File([blob], filename)
    return file
  }
  const errMsg = await res.text()
  throw new Error(errMsg)
}

export async function getMedias(tab: string): Promise<Filename[]> {
  const res = await fetch(`${API_ENDPOINT}/medias/${tab}`, {
    method: "GET",
  })
  if (res.ok) {
    const filenames = await res.json()
    return filenames
  }
  const errMsg = await res.text()
  throw new Error(errMsg)
}

export async function downloadToOutput(
  image: HTMLImageElement,
  filename: string,
  mimeType: string
) {
  const file = await srcToFile(image.src, filename, mimeType)
  const fd = new FormData()
  fd.append("image", file)
  fd.append("filename", filename)

  try {
    const res = await fetch(`${API_ENDPOINT}/save_image`, {
      method: "POST",
      body: fd,
    })
    console.log(res.ok)
    if (!res.ok) {
      const errMsg = await res.text()
      throw new Error(errMsg)
    }
  } catch (error) {
    throw new Error(`Something went wrong: ${error}`)
  }
}
