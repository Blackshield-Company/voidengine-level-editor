package voidlevel

// level.json loader for VoidEngine.
// Schema: schema/level.schema.json (version 1). Tile layers are the engine's
// own CSV tilemaps, loaded with engine.tilemap_load_csv.

import "core:encoding/json"
import "core:fmt"
import "core:os"
import "core:path/filepath"
import "core:reflect"
import "core:strings"
import "core:time"
import engine "voidengine:src/core"

LEVEL_VERSION :: 1

Sprite_Def :: struct {
	width:  i32,
	height: i32,
	color:  [4]u8,
	frame:  i32,
}

Collider_Def :: struct {
	width:    f32,
	height:   f32,
	offset_x: f32,
	offset_y: f32,
	layer:    string,
	mask:     []string,
}

Entity_Def :: struct {
	id:       u64,
	name:     string,
	spawn:    bool,
	x:        f32,
	y:        f32,
	sprite:   Sprite_Def,   // absent when width == 0
	collider: Collider_Def, // absent when layer == 
}

Layer_Def :: struct {
	name:      string,
	csv:       string,
	solid_ids: []i32,
	visible:   Maybe(bool),
}

Tileset_Def :: struct {
	path:    string,
	columns: i32,
}

Level_Def :: struct {
	version:   int,
	name:      string,
	tile_size: i32,
	width:     i32,
	height:    i32,
	tileset:   Tileset_Def,  // absent when path == ""
	layers:    []Layer_Def,
	entities:  []Entity_Def,
}

Layer :: struct {
	name:    string,
	visible: bool,
	tilemap: ^engine.Tilemap,
}

Level :: struct {
	path:     string,
	dir:      string,
	def:      Level_Def,
	layers:   [dynamic]Layer,
	mtime:    time.Time,
}

Load_Error :: enum {
	None,
	Read_Failed,
	Parse_Failed,
	Bad_Version,
	Bad_Layer,
	Bad_Collision_Layer,
}

// level_load reads level.json and every CSV layer it references.
level_load :: proc(path: string) -> (lvl: Level, err: Load_Error) {
	data, read_err := os.read_entire_file_from_path(path, context.allocator)
	if read_err != nil {
		return {}, .Read_Failed
	}
	defer delete(data)

	if json.unmarshal(data, &lvl.def) != nil {
		return {}, .Parse_Failed
	}
	if lvl.def.version != LEVEL_VERSION {
		level_free_def(&lvl.def)
		return {}, .Bad_Version
	}
	lvl.path = strings.clone(path)
	lvl.dir = strings.clone(filepath.dir(path))
	lvl.mtime = file_mtime(path)

	for e in lvl.def.entities {
		if c := e.collider; c.layer != "" {
			if _, ok := collision_layer(c.layer); !ok {
				level_destroy(&lvl)
				return {}, .Bad_Collision_Layer
			}
			for m in c.mask {
				if _, ok := collision_layer(m); !ok {
					level_destroy(&lvl)
					return {}, .Bad_Collision_Layer
				}
			}
		}
	}

	for ld in lvl.def.layers {
		csv_path, _ := filepath.join({lvl.dir, ld.csv}, context.temp_allocator)
		tm := engine.tilemap_load_csv(csv_path, lvl.def.tile_size)
		if tm == nil || tm.width != lvl.def.width || tm.height != lvl.def.height {
			if tm != nil { engine.tilemap_destroy(tm) }
			level_destroy(&lvl)
			return {}, .Bad_Layer
		}
		for id in ld.solid_ids {
			engine.tilemap_set_solid(tm, id)
		}
		vis, has := ld.visible.?
		append(&lvl.layers, Layer{name = ld.name, visible = !has || vis, tilemap = tm})
	}
	return lvl, .None
}

collision_layer :: proc(name: string) -> (engine.CollisionLayer, bool) {
	return reflect.enum_from_name(engine.CollisionLayer, name)
}

collision_mask :: proc(names: []string) -> (mask: engine.CollisionMask) {
	for n in names {
		if l, ok := collision_layer(n); ok {
			mask += {l}
		}
	}
	return
}

// level_spawn creates one engine entity per level entity, with Transform and
// (when present) Sprite and Collider components. Returns the spawn point,
// i.e. the first entity marked "spawn".
level_spawn :: proc(lvl: ^Level, scene: ^engine.Scene) -> (spawn: [2]f32, has_spawn: bool) {
	for e in lvl.def.entities {
		ent := engine.entity_create(scene)
		tr := new(engine.Transform)
		tr^ = engine.make_transform(e.x, e.y)
		engine.entity_add_component(ent, engine.Transform, tr)
		if s := e.sprite; s.width > 0 {
			sp := new(engine.Sprite)
			sp^ = engine.make_sprite(s.width, s.height, engine.color(s.color[0], s.color[1], s.color[2], s.color[3]))
			engine.entity_add_component(ent, engine.Sprite, sp)
		}
		if c := e.collider; c.layer != "" {
			layer, _ := collision_layer(c.layer)
			col := new(engine.Collider)
			col^ = engine.make_collider(c.width, c.height, layer, collision_mask(c.mask))
			col.offset = {c.offset_x, c.offset_y}
			engine.entity_add_component(ent, engine.Collider, col)
		}
		if e.spawn && !has_spawn {
			spawn, has_spawn = {e.x, e.y}, true
		}
	}
	return
}

// level_solid_at checks every layer's solid tiles at a world position.
level_solid_at :: proc(lvl: ^Level, x, y: f32) -> bool {
	if x < 0 || y < 0 { return false }
	for l in lvl.layers {
		if engine.tilemap_is_solid_at_world(l.tilemap, x, y) { return true }
	}
	return false
}

// level_changed reports whether level.json was modified since it was loaded.
// Pair it with level_load to hot-reload a level while the game runs.
level_changed :: proc(lvl: ^Level) -> bool {
	t := file_mtime(lvl.path)
	return time.diff(lvl.mtime, t) != 0
}

// level_reload replaces lvl with a fresh load if the file changed and parses.
// On a failed load the old level is kept.
level_reload :: proc(lvl: ^Level) -> (reloaded: bool) {
	if !level_changed(lvl) { return false }
	fresh, err := level_load(lvl.path)
	if err != .None {
		fmt.eprintln("voidlevel: reload failed:", err)
		lvl.mtime = file_mtime(lvl.path)
		return false
	}
	level_destroy(lvl)
	lvl^ = fresh
	return true
}

file_mtime :: proc(path: string) -> time.Time {
	fi, err := os.stat(path, context.temp_allocator)
	if err != nil { return {} }
	return fi.modification_time
}

level_free_def :: proc(d: ^Level_Def) {
	for &e in d.entities {
		delete(e.name)
		delete(e.collider.layer)
		for m in e.collider.mask { delete(m) }
		delete(e.collider.mask)
	}
	delete(d.entities)
	for l in d.layers {
		delete(l.name); delete(l.csv); delete(l.solid_ids)
	}
	delete(d.layers)
	delete(d.tileset.path)
	delete(d.name)
	d^ = {}
}

level_destroy :: proc(lvl: ^Level) {
	for l in lvl.layers { engine.tilemap_destroy(l.tilemap) }
	delete(lvl.layers)
	level_free_def(&lvl.def)
	delete(lvl.path)
	delete(lvl.dir)
	lvl^ = {}
}
