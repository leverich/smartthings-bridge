.PHONY: build deploy

build: lambda.zip

lambda.zip: index.js
	zip lambda.zip index.js

deploy:
	terraform apply
