#!/bin/bash

set -e

apk add python3 fping linux-headers libc-dev libffi-dev python3-dev gcc py3-pip
pip3 install --break-system-packages --upgrade pip wheel setuptools
pip3 install --break-system-packages --trusted-host pypi.python.org -r requirements-addon.txt
# Remove packages we only needed for installation
apk del linux-headers libc-dev libffi-dev python3-dev gcc