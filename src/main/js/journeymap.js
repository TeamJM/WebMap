"use strict";

import {ToastProgrammatic as Toast} from 'buefy'
import followIconOff from "../images/follow-off.png"
import followIconOn from "../images/follow-on.png"

import markerDotHostile from "../images/marker/dot-hostile.png";
import markerDotNeutral from "../images/marker/dot-neutral.png";
import markerDotVillager from "../images/marker/dot-villager.png";
import markerPlayer from "../images/player/self.png";

import datastore from "./datastore";
import {translateCoords} from "./methods";

export class JMError extends Error {
    constructor(statusCode, errorText, responseObj) {
        super();

        this.statusCode = statusCode;
        this.errorText = errorText;
        this.responseObj = responseObj;
    }
}


class Journeymap {
    constructor() {
        this.tiles = {};
        this.changedTiles = [];
        this.lastTileCheck = Date.now();

        this.currentDim = 0;
        this.currentMapType = "day";
        this.currentSlice = 0;
        this.currentZoom = 0;

        this.followMode = false;
        this.ignoreSetFollowMode = false;
    }

    async data(type, imagesSince) {
        let url = `/data/${type}`;

        if (imagesSince !== undefined) {
            url = url + `?images.since=${imagesSince}`
        }

        const response = await fetch(
            url,
            {method: "GET"},
        );

        if (! response.ok) {
            throw new JMError(response.status, response.statusText, response)
        }

        return await response.json()
    }

    async polygons() {
        const url = "/polygons";
        const response = await fetch(
            url,
            {method: "GET"},
        );

        if (! response.ok) {
            throw new JMError(response.status, response.statusText, response)
        }

        return await response.json()
    }

    async logs() {
        const response = await fetch(
            "/logs",
            {method: "GET"},
        );

        if (! response.ok) {
            throw new JMError(response.status, response.statusText, response)
        }

        return await response.json()
    }

    async getProperties() {
        const response = await fetch(
            "/properties",
            {method: "GET"},
        );

        if (! response.ok) {
            throw new JMError(response.status, response.statusText, response)
        }

        return await response.json()
    }

    async setProperties(properties) {
        const data = new FormData();

        for (let key of properties) {
            data.append(key, properties[key]);
        }

        const response = await fetch(
            "/properties",
            {method: "POST", body: data},
        );

        if (! response.ok) {
            throw new JMError(response.status, response.statusText, response)
        }

        return await response.json()
    }

    skinUrl(username) {
        return `/skin/${username}`
    }

    tileUrl(x, z, givenZoom) {
        let zoom = 0;

        if (givenZoom !== undefined) {
            zoom = givenZoom;
        }

        let slug = this._slugifyTile(x, z, zoom);

        if (slug in this.tiles) {
            if (! this.changedTiles.includes(slug)) {
                return this.tiles[slug]
            }

            this.changedTiles.splice(
                this.changedTiles.indexOf(slug), 1,
            )
        }

        const dimension = this.currentDim,
            mapTypeString = this.currentMapType,
            y = this.currentSlice;

        const time = Date.now();  // This ensures that we don't end up with a cached URL
        const url = `/tiles/tile.png?x=${x}&y=${y}&z=${z}&dimension=${dimension}&mapTypeString=${mapTypeString}&zoom=${zoom}&t=${time}`;

        this.tiles[slug] = url;

        return url
    }

    setFollowMode(mode) {
        if (this.ignoreSetFollowMode) {
            this.ignoreSetFollowMode = false;
            return;
        }

        this.followMode = mode;

        if (this.followMode) {
            datastore.state.followIcon = followIconOn;

            Toast.open({
                type: "is-success",
                message: "Follow mode enabled.",
            });
        } else {
            datastore.state.followIcon = followIconOff;

            Toast.open({
                type: "is-success",
                message: "Follow mode disabled.",
            });
        }
    }

    toggleFollowMode() {
        this.setFollowMode(! this.followMode);
    }

    async _checkForChanges() {
        let now = Date.now();
        let data = await this.data("all", this.lastTileCheck);

        for (let element of data.images.regions) {
            for (let i of Array(5).keys()) {
                let slug = this._slugifyTile(element[0], element[1], i);

                if (! this.changedTiles.includes(slug)) {
                    this.changedTiles.push(slug);
                }
            }
        }

        this.lastTileCheck = now;

        data.animals = await this.data("animals", this.lastTileCheck);
        data.mobs = await this.data("mobs", this.lastTileCheck);
        data.polygons = await this.polygons();
        data.players = await this.data("players", this.lastTileCheck);
        data.villagers = await this.data("villagers", this.lastTileCheck);

        window.app.markers = this._buildMarkers(data);
        window.app.polygons = this._buildPolygons(data);
        window.app.waypoints = this._buildWaypoints(data);

        if (this.followMode) {
            this.ignoreSetFollowMode = true;
            app.$refs.map.mapObject.setView(translateCoords(data.player.posX, data.player.posZ))
        }
    }

    _buildMarkers(data) {
        let markers = [];

        const player = data.player;

        markers.push({
            latLng: translateCoords(player.posX, player.posZ),
            url: markerPlayer,
            size: 32,
            zIndex: 1000,

            options: {
                rotationAngle: player.heading,
                rotationOrigin: "center",
            },
        });

        for (let animal of Object.values(data.animals)) {
            markers.push({
                latLng: translateCoords(animal.posX, animal.posZ),
                url: animal.hostile ? markerDotHostile : markerDotNeutral,
                size: 48,
                zIndex: 1,

                options: {
                    rotationAngle: animal.heading,
                    rotationOrigin: "center",
                },

                key: animal.entityId,
            });

            markers.push({
                className: "round-icon",
                latLng: translateCoords(animal.posX, animal.posZ),
                url: `/resources?resource=${encodeURIComponent(animal.iconLocation)}`,
                size: 14,
                zIndex: 2,

                key: `${animal.entityId}/icon`,
            })
        }

        for (let mob of Object.values(data.mobs)) {
            markers.push({
                latLng: translateCoords(mob.posX, mob.posZ),
                url: mob.hostile ? markerDotHostile : markerDotNeutral,
                size: 48,
                zIndex: 1,

                options: {
                    rotationAngle: mob.heading,
                    rotationOrigin: "center",
                },

                key: mob.entityId,
            });

            markers.push({
                className: "round-icon",
                latLng: translateCoords(mob.posX, mob.posZ),
                url: `/resources?resource=${encodeURIComponent(mob.iconLocation)}`,
                size: 14,
                zIndex: 2,

                key: `${mob.entityId}/icon`,
            })
        }

        for (let villager of Object.values(data.villagers)) {
            markers.push({
                latLng: translateCoords(villager.posX, villager.posZ),
                url: villager.hostile ? markerDotHostile : markerDotVillager,
                size: 48,
                zIndex: 1,

                options: {
                    rotationAngle: villager.heading,
                    rotationOrigin: "center",
                },

                key: villager.entityId,
            });

            markers.push({
                className: "round-icon",
                latLng: translateCoords(villager.posX, villager.posZ),
                url: `/resources?resource=${encodeURIComponent(villager.iconLocation)}`,
                size: 14,
                zIndex: 2,

                key: `${villager.entityId}/icon`,
            })
        }

        return markers
    }

    _buildPolygons(data) {
        let polygons = [];

        for (let polygon of Object.values(data.polygons)) {
            let coords = [];
            let holes = [];

            for (let point of Object.values(polygon.points)) {
                coords.push(translateCoords(point.x, point.z))
            }

            if (polygon.holes.size > 0) {
                for (let holeObj of Object.values(polygon.holes)) {
                    let hole = [];

                    for (let point of Object.values(holeObj)) {
                        hole.push(translateCoords(point.x, point.z))
                    }

                    holes.push(hole)
                }

                coords = coords.concat([coords], holes)
            }

            polygons.push({
                latLngs: coords,

                strokeColor: polygon.strokeColor,
                strokeOpacity: polygon.strokeOpacity,
                strokeWidth: polygon.strokeWidth,

                fillColor: polygon.fillColor,
                fillOpacity: polygon.fillOpacity,
            })
        }

        return polygons
    }

    _buildWaypoints(data) {
        let waypoints = [];
        const zoomOffset = 6 - this.currentZoom;

        for (let waypoint of Object.values(data.waypoints)) {
            if (! waypoint.enable) {
                continue;
            }

            let coords = translateCoords(waypoint.x + 0.5, waypoint.z + 0.5);

            let red = waypoint.r.toString(16).padStart(2, "0");
            let green = waypoint.g.toString(16).padStart(2, "0");
            let blue = waypoint.b.toString(16).padStart(2, "0");

            waypoints.push({
                coords: coords,
                latLngs: [
                    [coords[0] + zoomOffset, coords[1]],
                    [coords[0], coords[1] + zoomOffset],
                    [coords[0] - zoomOffset, coords[1]],
                    [coords[0], coords[1] - zoomOffset],
                ],

                color: `#${red}${green}${blue}`,
            })
        }

        return waypoints
    }

    _slugifyTile(x, z, givenZoom) {
        let dim = this.currentDim,
            type = this.currentMapType,
            y = this.currentSlice,
            zoom = 0;

        if (givenZoom !== undefined) {
            zoom = givenZoom;
        }

        return `X ${x}, Y ${y}, Z ${z} / Dim ${dim}, Type ${type}, Zoom ${zoom}`
    }

    setZoom(zoom) {
        this.currentZoom = Number(zoom);

        const zoomOffset = 6 - this.currentZoom;

        for (let waypoint of Object.values(window.app.waypoints)) {
            waypoint.latLngs = [
                [waypoint.coords[0] + zoomOffset, waypoint.coords[1]],
                [waypoint.coords[0], waypoint.coords[1] + zoomOffset],
                [waypoint.coords[0] - zoomOffset, waypoint.coords[1]],
                [waypoint.coords[0], waypoint.coords[1] - zoomOffset],
            ]
        }
    }
}

export const JM = new Journeymap();