#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_CAPABILITIES_URL =
    'http://127.0.0.1:8081/geoserver/gwc/service/wmts?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0'
const DEFAULT_OUTPUT_DIR = path.resolve(
    'test-artifacts/static-road-tiles/xyz',
)
const DEFAULT_LAYER = 'smart_transit:city_roads'
const DEFAULT_STYLE = 'smart_transit:city_roads_style'
const DEFAULT_MATRIX_SET = 'EPSG:900913'
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function parseArgs(argv) {
    const options = {
        capabilitiesUrl:
            process.env.ROAD_WMTS_CAPABILITIES_URL ||
            DEFAULT_CAPABILITIES_URL,
        outputDir: path.resolve(
            process.env.ROAD_TILES_OUTPUT_DIR || DEFAULT_OUTPUT_DIR,
        ),
        startLevel: 9,
        endLevel: 17,
        concurrency: 6,
        retries: 2,
        timeoutMs: 30_000,
        maxTiles: 100_000,
        generate: false,
    }

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index]
        if (argument === '--generate') {
            options.generate = true
        } else if (argument === '--capabilities-url') {
            options.capabilitiesUrl = argv[++index]
        } else if (argument === '--output') {
            options.outputDir = path.resolve(argv[++index])
        } else if (argument === '--levels') {
            const match = /^(\d+)(?:-(\d+))?$/.exec(argv[++index])
            if (!match) {
                throw new Error('--levels must use N or N-M')
            }
            options.startLevel = Number(match[1])
            options.endLevel = Number(match[2] ?? match[1])
        } else if (argument === '--concurrency') {
            options.concurrency = Number(argv[++index])
        } else if (argument === '--retries') {
            options.retries = Number(argv[++index])
        } else if (argument === '--timeout-ms') {
            options.timeoutMs = Number(argv[++index])
        } else if (argument === '--max-tiles') {
            options.maxTiles = Number(argv[++index])
        } else if (argument === '--help') {
            printHelp()
            process.exit(0)
        } else {
            throw new Error(`Unknown argument: ${argument}`)
        }
    }

    if (
        !Number.isInteger(options.startLevel) ||
        !Number.isInteger(options.endLevel) ||
        options.startLevel < 0 ||
        options.endLevel < options.startLevel ||
        options.endLevel > 21
    ) {
        throw new Error('levels must be an integer range between 0 and 21')
    }
    if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
        throw new Error('--concurrency must be a positive integer')
    }
    if (!Number.isInteger(options.maxTiles) || options.maxTiles < 1) {
        throw new Error('--max-tiles must be a positive integer')
    }

    return options
}

function printHelp() {
    console.log(`Generate transparent XYZ PNG tiles by requesting the live GeoServer WMTS.

Plan only (default):
  node scripts/generate-static-road-tiles.mjs --levels 9-17

Generate:
  node scripts/generate-static-road-tiles.mjs --generate --levels 9-17

Options:
  --capabilities-url URL   WMTS GetCapabilities URL
  --output DIR             XYZ output directory
  --levels N-M             Matrix levels; guarded to 0-21
  --concurrency N          Concurrent requests (default: 6)
  --retries N              Retries after a failed request (default: 2)
  --timeout-ms N           Per-request timeout (default: 30000)
  --max-tiles N            Safety limit (default: 100000)
`)
}

function textBetween(value, start, end) {
    const startIndex = value.indexOf(start)
    if (startIndex < 0) {
        return undefined
    }
    const valueStart = startIndex + start.length
    const endIndex = value.indexOf(end, valueStart)
    return endIndex < 0 ? undefined : value.slice(valueStart, endIndex).trim()
}

function findLayerBlock(xml, layerIdentifier) {
    const layerPattern = /<Layer>[\s\S]*?<\/Layer>/g
    for (const match of xml.matchAll(layerPattern)) {
        if (match[0].includes(`<ows:Identifier>${layerIdentifier}</ows:Identifier>`)) {
            return match[0]
        }
    }
    throw new Error(`WMTS layer not found: ${layerIdentifier}`)
}

function parseCapabilities(xml) {
    const layerXml = findLayerBlock(xml, DEFAULT_LAYER)
    const matrixSetLink = [...layerXml.matchAll(/<TileMatrixSetLink>[\s\S]*?<\/TileMatrixSetLink>/g)].find(
        (match) => match[0].includes(`<TileMatrixSet>${DEFAULT_MATRIX_SET}</TileMatrixSet>`),
    )?.[0]

    if (!matrixSetLink) {
        throw new Error(`WMTS matrix set link not found: ${DEFAULT_MATRIX_SET}`)
    }

    const limits = new Map()
    const limitPattern = /<TileMatrixLimits>[\s\S]*?<\/TileMatrixLimits>/g
    for (const match of matrixSetLink.matchAll(limitPattern)) {
        const limitXml = match[0]
        const identifier = textBetween(limitXml, '<TileMatrix>', '</TileMatrix>')
        if (!identifier) {
            continue
        }
        const values = ['MinTileRow', 'MaxTileRow', 'MinTileCol', 'MaxTileCol'].map(
            (name) => Number(textBetween(limitXml, `<${name}>`, `</${name}>`)),
        )
        if (values.some((value) => !Number.isInteger(value))) {
            throw new Error(`Invalid tile limits for ${identifier}`)
        }
        limits.set(identifier, {
            minRow: values[0],
            maxRow: values[1],
            minCol: values[2],
            maxCol: values[3],
        })
    }

    const lowerCorner = textBetween(
        layerXml,
        '<ows:LowerCorner>',
        '</ows:LowerCorner>',
    )
    const upperCorner = textBetween(
        layerXml,
        '<ows:UpperCorner>',
        '</ows:UpperCorner>',
    )
    const style = textBetween(
        layerXml,
        '<Style isDefault="true">\n        <ows:Identifier>',
        '</ows:Identifier>',
    )

    if (!lowerCorner || !upperCorner) {
        throw new Error('WMTS layer WGS84 bounding box not found')
    }

    return {
        layer: DEFAULT_LAYER,
        style: style || DEFAULT_STYLE,
        format: 'image/png',
        matrixSet: DEFAULT_MATRIX_SET,
        lowerCorner,
        upperCorner,
        limits,
    }
}

function buildTilePlan(capabilities, startLevel, endLevel) {
    const plan = []
    for (let level = startLevel; level <= endLevel; level += 1) {
        const identifier = `${capabilities.matrixSet}:${level}`
        const limit = capabilities.limits.get(identifier)
        if (!limit) {
            throw new Error(`No WMTS TileMatrixLimits found for ${identifier}`)
        }
        for (let y = limit.minRow; y <= limit.maxRow; y += 1) {
            for (let x = limit.minCol; x <= limit.maxCol; x += 1) {
                plan.push({ level, x, y })
            }
        }
    }
    return plan
}

function tileUrl(capabilities, capabilitiesUrl, tile) {
    const endpoint = new URL(capabilitiesUrl)
    endpoint.search = ''
    endpoint.pathname = endpoint.pathname.replace(/GetCapabilities$/i, '')
    endpoint.searchParams.set('SERVICE', 'WMTS')
    endpoint.searchParams.set('REQUEST', 'GetTile')
    endpoint.searchParams.set('VERSION', '1.0.0')
    endpoint.searchParams.set('LAYER', capabilities.layer)
    endpoint.searchParams.set('STYLE', capabilities.style)
    endpoint.searchParams.set('FORMAT', capabilities.format)
    endpoint.searchParams.set('TILEMATRIXSET', capabilities.matrixSet)
    endpoint.searchParams.set(
        'TILEMATRIX',
        `${capabilities.matrixSet}:${tile.level}`,
    )
    endpoint.searchParams.set('TILEROW', String(tile.y))
    endpoint.searchParams.set('TILECOL', String(tile.x))
    return endpoint
}

function isPng(buffer) {
    return buffer.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.equals(buffer.subarray(0, 8))
}

async function existingPngBytes(filePath) {
    try {
        const file = await readFile(filePath)
        return isPng(file) ? file.length : undefined
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return undefined
        }
        throw error
    }
}

async function requestTile(endpoint, timeoutMs, retries) {
    let lastError
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        try {
            const response = await fetch(endpoint, {
                signal: controller.signal,
                headers: { Accept: 'image/png' },
            })
            const body = Buffer.from(await response.arrayBuffer())
            if (!response.ok || !isPng(body)) {
                const contentType = response.headers.get('content-type') || 'unknown'
                throw new Error(
                    `HTTP ${response.status}, content-type ${contentType}, bytes ${body.length}`,
                )
            }
            return body
        } catch (error) {
            lastError = error
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
            }
        } finally {
            clearTimeout(timer)
        }
    }
    throw lastError
}

function summarizePlan(plan) {
    const byLevel = new Map()
    for (const tile of plan) {
        const level = byLevel.get(tile.level) || 0
        byLevel.set(tile.level, level + 1)
    }
    return [...byLevel.entries()].map(([level, count]) => ({ level, count }))
}

async function main() {
    const options = parseArgs(process.argv.slice(2))
    const startedAt = new Date()
    const capabilitiesResponse = await fetch(options.capabilitiesUrl)
    if (!capabilitiesResponse.ok) {
        throw new Error(`GetCapabilities failed: HTTP ${capabilitiesResponse.status}`)
    }
    const capabilitiesXml = await capabilitiesResponse.text()
    const capabilities = parseCapabilities(capabilitiesXml)
    const plan = buildTilePlan(
        capabilities,
        options.startLevel,
        options.endLevel,
    )

    if (plan.length > options.maxTiles) {
        throw new Error(
            `Refusing ${plan.length} tiles; --max-tiles is ${options.maxTiles}`,
        )
    }

    const perLevel = summarizePlan(plan)
    console.log(`WMTS layer: ${capabilities.layer}`)
    console.log(`Style: ${capabilities.style}`)
    console.log(`Matrix set: ${capabilities.matrixSet}`)
    console.log(`WGS84 bbox: ${capabilities.lowerCorner} -> ${capabilities.upperCorner}`)
    console.log(`Levels: ${options.startLevel}-${options.endLevel}`)
    console.table(perLevel)
    console.log(`Planned tiles: ${plan.length}`)

    if (!options.generate) {
        console.log('Plan only; no files were written. Use --generate to request PNGs.')
        return
    }

    await mkdir(options.outputDir, { recursive: true })
    const result = {
        generatedAt: startedAt.toISOString(),
        source: {
            capabilitiesUrl: options.capabilitiesUrl,
            layer: capabilities.layer,
            style: capabilities.style,
            format: capabilities.format,
            matrixSet: capabilities.matrixSet,
            lowerCorner: capabilities.lowerCorner,
            upperCorner: capabilities.upperCorner,
            rowIsXyzY: true,
            projection: 'WebMercator / EPSG:900913',
        },
        levels: {
            start: options.startLevel,
            end: options.endLevel,
            planned: plan.length,
        },
        settings: {
            concurrency: options.concurrency,
            retries: options.retries,
            timeoutMs: options.timeoutMs,
            outputDir: options.outputDir,
        },
        perLevel: Object.fromEntries(
            perLevel.map(({ level, count }) => [String(level), { planned: count }]),
        ),
        generated: 0,
        skipped: 0,
        failed: 0,
        bytes: 0,
        failures: [],
    }

    let nextIndex = 0
    let completed = 0
    const startedMs = Date.now()
    async function worker() {
        while (true) {
            const index = nextIndex
            nextIndex += 1
            if (index >= plan.length) {
                return
            }

            const tile = plan[index]
            const levelDir = path.join(options.outputDir, String(tile.level), String(tile.x))
            const outputPath = path.join(levelDir, `${tile.y}.png`)
            const existingBytes = await existingPngBytes(outputPath)
            if (existingBytes !== undefined) {
                result.skipped += 1
                result.bytes += existingBytes
                result.perLevel[String(tile.level)].skipped =
                    (result.perLevel[String(tile.level)].skipped || 0) + 1
                completed += 1
                continue
            }

            try {
                const body = await requestTile(
                    tileUrl(capabilities, options.capabilitiesUrl, tile),
                    options.timeoutMs,
                    options.retries,
                )
                await mkdir(levelDir, { recursive: true })
                await writeFile(outputPath, body)
                result.generated += 1
                result.bytes += body.length
                result.perLevel[String(tile.level)].generated =
                    (result.perLevel[String(tile.level)].generated || 0) + 1
                result.perLevel[String(tile.level)].bytes =
                    (result.perLevel[String(tile.level)].bytes || 0) + body.length
            } catch (error) {
                result.failed += 1
                result.perLevel[String(tile.level)].failed =
                    (result.perLevel[String(tile.level)].failed || 0) + 1
                result.failures.push({
                    level: tile.level,
                    x: tile.x,
                    y: tile.y,
                    error: String(error?.message || error),
                })
            }

            completed += 1
            if (completed % 100 === 0 || completed === plan.length) {
                const elapsedSeconds = (Date.now() - startedMs) / 1000
                console.log(
                    `progress ${completed}/${plan.length}; ` +
                        `generated=${result.generated}; skipped=${result.skipped}; ` +
                        `failed=${result.failed}; elapsed=${elapsedSeconds.toFixed(1)}s`,
                )
            }
        }
    }

    await Promise.all(
        Array.from(
            { length: Math.min(options.concurrency, plan.length) },
            () => worker(),
        ),
    )

    result.completedAt = new Date().toISOString()
    result.elapsedSeconds = Number(((Date.now() - startedMs) / 1000).toFixed(3))
    await writeFile(
        path.join(options.outputDir, 'manifest.json'),
        `${JSON.stringify(result, null, 2)}\n`,
        'utf8',
    )

    console.log(`PNG bytes: ${result.bytes}`)
    console.log(`Manifest: ${path.join(options.outputDir, 'manifest.json')}`)
    if (result.failed > 0) {
        process.exitCode = 2
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
