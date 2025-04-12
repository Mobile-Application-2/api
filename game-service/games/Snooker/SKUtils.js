export default class SnookerUtils {
    /**
     * Find intersection between a ray and a circle
     */
    static rayCircleIntersection(rayX, rayY, rayDirX, rayDirY, circleX, circleY, circleRadius) {
        // Vector from ray origin to circle center
        const dx = circleX - rayX;
        const dy = circleY - rayY;

        // Project circle center onto ray direction
        const projection = dx * rayDirX + dy * rayDirY;

        // Distance from circle center to ray
        const perpDist = Math.sqrt(dx * dx + dy * dy - projection * projection);

        // If ray doesn't intersect the circle
        if (perpDist > circleRadius) {
            return null;
        }

        // Distance from projection to intersection point
        const distToIntersection = Math.sqrt(circleRadius * circleRadius - perpDist * perpDist);

        // Distance from ray origin to intersection point
        const distance = projection - distToIntersection;

        // We only care about intersections in front of the ray
        if (distance < 0) {
            return null;
        }

        return {
            distance: distance,
            point: {
                x: rayX + rayDirX * distance,
                y: rayY + rayDirY * distance
            }
        };
    }

    /**
     * Find intersection between a ray and a line segment
     */
    static rayLineIntersection(rayX, rayY, rayDirX, rayDirY, lineX1, lineY1, lineX2, lineY2) {
        // Line segment direction
        const lineVecX = lineX2 - lineX1;
        const lineVecY = lineY2 - lineY1;

        // Calculate determinant
        const det = lineVecX * (-rayDirY) - lineVecY * (-rayDirX);

        // Lines are parallel if determinant is zero
        if (Math.abs(det) < 0.0001) {
            return null;
        }

        // Calculate inverse of determinant
        const invDet = 1 / det;

        // Vector from line start to ray start
        const diffX = rayX - lineX1;
        const diffY = rayY - lineY1;

        // Calculate intersection parameters
        const t = (diffX * (-rayDirY) - diffY * (-rayDirX)) * invDet;
        const u = (lineVecX * diffY - lineVecY * diffX) * invDet;

        // Check if intersection is within bounds
        if (t >= 0 && t <= 1 && u >= 0) {
            // Calculate intersection point
            const intersectX = lineX1 + t * lineVecX;
            const intersectY = lineY1 + t * lineVecY;

            // Calculate distance
            const distance = Math.sqrt(
                (intersectX - rayX) * (intersectX - rayX) +
                (intersectY - rayY) * (intersectY - rayY)
            );

            // Calculate surface normal (perpendicular to line segment)
            const lineLength = Math.sqrt(lineVecX * lineVecX + lineVecY * lineVecY);
            const normalX = -lineVecY / lineLength;
            const normalY = lineVecX / lineLength;

            return {
                distance: distance,
                point: { x: intersectX, y: intersectY },
                normal: { x: normalX, y: normalY }
            };
        }

        return null;
    }

    /**
     * Calculate a reflection vector
     */
    static reflect(dirX, dirY, normalX, normalY) {
        // Calculate dot product
        const dot = dirX * normalX + dirY * normalY;

        // Calculate reflection vector using r = d - 2(d·n)n
        return {
            x: dirX - 2 * dot * normalX,
            y: dirY - 2 * dot * normalY
        };
    }

}
