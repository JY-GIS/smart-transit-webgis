package com.jygis.smarttransit.controller;

import com.jygis.smarttransit.common.Result;
import com.jygis.smarttransit.service.PlaceSearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/places")
@RequiredArgsConstructor
public class PlaceSearchController {
    private final PlaceSearchService placeSearchService;

    @GetMapping("/suggestions")
    public Result suggestions(@RequestParam(name = "keywords", defaultValue = "") String keywords) {
        return query(keywords, true);
    }

    @GetMapping("/search")
    public Result search(@RequestParam(name = "keywords", defaultValue = "") String keywords) {
        return query(keywords, false);
    }

    @GetMapping("/search/page")
    public Result searchPage(@RequestParam String keywords, @RequestParam(defaultValue = "1") int page) {
        try {
            return Result.success(placeSearchService.searchPage(keywords, page));
        } catch (IllegalArgumentException | IllegalStateException exception) {
            return Result.error(exception.getMessage());
        }
    }

    private Result query(String keywords, boolean suggest) {
        try {
            return Result.success(suggest ? placeSearchService.suggestions(keywords) : placeSearchService.search(keywords));
        } catch (IllegalArgumentException | IllegalStateException exception) {
            return Result.error(exception.getMessage());
        }
    }
}
