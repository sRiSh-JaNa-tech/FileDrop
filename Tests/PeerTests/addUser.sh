#!/bin/bash

REDIS_URL="redis://default:NHiBlvdMwHcrw15ETdpzLQlQPlQ2Fx1k@redis-15748.c309.us-east-2-1.ec2.cloud.redislabs.com:15748"

read -p "Enter the UserId: " userId
read -p "Enter the Name: " name
read -p "Enter the PeerId: " peerId

if [ -z "$userId" ] || [ -z "$name" ] || [ -z "$peerId" ]; then
    echo "All fields are required"
    exit 1
fi

echo "Inserting data into Redis..."

redis-cli -u "$REDIS_URL" HSET "user:$userId" name "$name" peerId "$peerId"
redis-cli -u "$REDIS_URL" SET "username:$name" "$userId"
redis-cli -u "$REDIS_URL" SET "peer:$peerId" "$userId"

echo "User created successfully!"
