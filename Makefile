.PHONY: setup up down logs test smoke backup
setup:
	npm run setup
up:
	docker compose --profile monitoring up -d --build --wait
down:
	docker compose --profile monitoring down
logs:
	docker compose logs --tail=100 -f api
test:
	npm run check
	npm test
smoke:
	npm run smoke
backup:
	bash scripts/backup.sh
