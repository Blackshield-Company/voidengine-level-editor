VOIDENGINE ?= ../voidengine
ODIN_FLAGS := -collection:voidengine=$(VOIDENGINE)

.PHONY: test odin-test web-test demo check-demo play
test: odin-test web-test

odin-test:
	odin test odin/tests $(ODIN_FLAGS) -out:./voidlevel-test

demo:
	odin build examples/level_demo $(ODIN_FLAGS) -out:./level_demo -debug

check-demo: demo
	./level_demo fixtures/basic/level.json --check

play: demo
	./level_demo $(LEVEL)

web-test:
	cd editor && npm test
