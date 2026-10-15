package main

// level_demo: loads a level.json, draws its tile layers and entities, and
// hot-reloads the level whenever the file changes on disk.
//   level_demo [path/to/level.json] [--check]
// --check loads the level, prints a summary and exits (no window).

import "core:fmt"
import "core:os"
import SDL "vendor:sdl2"
import engine "voidengine:src/core"
import vl "../../odin/voidlevel"

main :: proc() {
	path := "fixtures/basic/level.json"
	check := false
	for a in os.args[1:] {
		if a == "--check" { check = true } else { path = a }
	}

	lvl, err := vl.level_load(path)
	if err != .None {
		fmt.eprintln("level_demo: cannot load", path, "-", err)
		os.exit(1)
	}
	defer vl.level_destroy(&lvl)
	fmt.printfln("level %q: %dx%d tiles @ %dpx, %d layers, %d entities",
		lvl.def.name, lvl.def.width, lvl.def.height, lvl.def.tile_size,
		len(lvl.layers), len(lvl.def.entities))
	if check { return }

	if SDL.Init({.VIDEO}) != 0 {
		fmt.eprintln("SDL init failed:", SDL.GetError())
		os.exit(1)
	}
	defer SDL.Quit()
	ts := lvl.def.tile_size
	win := SDL.CreateWindow("VoidEngine level demo", SDL.WINDOWPOS_CENTERED, SDL.WINDOWPOS_CENTERED,
		max(lvl.def.width * ts, 320), max(lvl.def.height * ts, 240), {.RESIZABLE})
	defer SDL.DestroyWindow(win)
	ren := SDL.CreateRenderer(win, -1, {.ACCELERATED, .PRESENTVSYNC})
	defer SDL.DestroyRenderer(ren)

	frame := 0
	for running := true; running; frame += 1 {
		ev: SDL.Event
		for SDL.PollEvent(&ev) {
			#partial switch ev.type {
			case .QUIT: running = false
			case .KEYDOWN: if ev.key.keysym.sym == .ESCAPE { running = false }
			}
		}
		if frame % 30 == 0 && vl.level_reload(&lvl) {
			fmt.println("[level_demo] reloaded", lvl.path)
		}

		SDL.SetRenderDrawColor(ren, 18, 10, 32, 255)
		SDL.RenderClear(ren)
		for l in lvl.layers {
			if l.visible { engine.tilemap_render(ren, l.tilemap) }
		}
		for e in lvl.def.entities {
			w, h := i32(ts), i32(ts)
			c := [4]u8{255, 255, 255, 255}
			if e.sprite.width > 0 { w, h, c = e.sprite.width, e.sprite.height, e.sprite.color }
			r := SDL.Rect{i32(e.x) - w / 2, i32(e.y) - h / 2, w, h}
			SDL.SetRenderDrawColor(ren, c[0], c[1], c[2], c[3])
			SDL.RenderFillRect(ren, &r)
			if e.spawn {
				SDL.SetRenderDrawColor(ren, 255, 255, 0, 255)
				SDL.RenderDrawRect(ren, &r)
			}
		}
		SDL.RenderPresent(ren)
	}
}
