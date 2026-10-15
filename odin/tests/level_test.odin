package voidlevel_tests

import "core:os"
import "core:testing"
import engine "voidengine:src/core"
import vl "../voidlevel"

FIXTURE :: "fixtures/basic/level.json"

@(test)
loads_fixture :: proc(t: ^testing.T) {
	lvl, err := vl.level_load(FIXTURE)
	defer vl.level_destroy(&lvl)
	testing.expect_value(t, err, vl.Load_Error.None)
	testing.expect_value(t, lvl.def.name, "basic")
	testing.expect_value(t, len(lvl.layers), 2)
	testing.expect_value(t, len(lvl.def.entities), 2)
	g := lvl.layers[0].tilemap
	testing.expect_value(t, g.width, 10)
	testing.expect_value(t, g.height, 6)
	testing.expect_value(t, engine.tilemap_get(g, 7, 2), 3)
	testing.expect(t, engine.tilemap_is_solid(g, 0, 0))
	testing.expect(t, engine.tilemap_is_solid(g, 4, 3))
	testing.expect(t, !engine.tilemap_is_solid(g, 7, 2), "id 3 is not solid")
	testing.expect(t, vl.level_solid_at(&lvl, 5, 5))
	testing.expect(t, !vl.level_solid_at(&lvl, 64, 64))
}

@(test)
spawns_entities :: proc(t: ^testing.T) {
	lvl, err := vl.level_load(FIXTURE)
	defer vl.level_destroy(&lvl)
	testing.expect_value(t, err, vl.Load_Error.None)
	scene := new(engine.Scene)
	defer {
		for e in scene.entities {
			for _, p in e.components { free(p) }
			delete(e.components); free(e)
		}
		delete(scene.entities); free(scene)
	}
	spawn, ok := vl.level_spawn(&lvl, scene)
	testing.expect(t, ok)
	testing.expect_value(t, spawn, [2]f32{64, 64})
	testing.expect_value(t, len(scene.entities), 2)
	slime := scene.entities[1]
	col := engine.entity_get_component(slime, engine.Collider)
	testing.expect(t, col != nil)
	testing.expect_value(t, col.layer, engine.CollisionLayer.Enemy)
	testing.expect_value(t, col.mask, engine.CollisionMask{.Player, .PlayerBullet, .Wall})
	testing.expect_value(t, col.offset.y, 2)
	sp := engine.entity_get_component(slime, engine.Sprite)
	testing.expect_value(t, sp.width, 20)
	testing.expect_value(t, sp.color.r, 255)
}

@(test)
rejects_bad_files :: proc(t: ^testing.T) {
	dir :: "fixtures/.tmp"
	os.make_directory(dir)
	_ = os.write_entire_file(dir + "/v2.json", transmute([]u8)string(`{"version":2,"name":"x","tile_size":8,"width":1,"height":1,"layers":[],"entities":[]}`))
	_ = os.write_entire_file(dir + "/badlayer.json", transmute([]u8)string(`{"version":1,"name":"x","tile_size":8,"width":1,"height":1,"layers":[],"entities":[{"id":1,"name":"a","x":0,"y":0,"collider":{"width":1,"height":1,"layer":"Nope"}}]}`))
	_ = os.write_entire_file(dir + "/size.json", transmute([]u8)string(`{"version":1,"name":"x","tile_size":8,"width":3,"height":1,"layers":[{"name":"g","csv":"../basic/ground.csv"}],"entities":[]}`))
	_, e1 := vl.level_load(dir + "/v2.json")
	testing.expect_value(t, e1, vl.Load_Error.Bad_Version)
	_, e2 := vl.level_load(dir + "/badlayer.json")
	testing.expect_value(t, e2, vl.Load_Error.Bad_Collision_Layer)
	_, e3 := vl.level_load(dir + "/size.json")
	testing.expect_value(t, e3, vl.Load_Error.Bad_Layer)
	_, e4 := vl.level_load(dir + "/missing.json")
	testing.expect_value(t, e4, vl.Load_Error.Read_Failed)
}
