package com.jygis.smarttransit.mapper;

import com.jygis.smarttransit.pojo.Stop;
import org.apache.ibatis.annotations.Mapper;

import java.util.List;

@Mapper
public interface StopMapper {

    List<Stop> findAll();
}